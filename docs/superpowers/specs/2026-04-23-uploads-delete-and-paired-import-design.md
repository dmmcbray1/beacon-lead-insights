# Delete Uploads & Paired Import — Design

## Summary

Two related features for the Upload Center:

1. **Delete uploads** — admins can delete any upload batch; all derived data (call events, lead status events, quote events, callback events, staff assignments, lead identities) cascades away with it. Stats auto-correct after deletion.
2. **Paired imports** — replace the one-file-at-a-time upload flow with an atomic batch: the user picks a Daily Call Report **and** a Deer Dama (Lead) Report in a single operation, picks one upload date, and imports both together. If either half fails, the other half is rolled back automatically.

The two features share a single underlying mechanism — cascade delete on `uploads` — so Feature 1 ships first and Feature 2 reuses it for rollback.

Existing uploads are handled via clean-slate: the admin deletes pre-existing uploads using the new delete feature before the paired-import enforcement matters. No data migration code.

## Goals

- Admins can remove a bad/duplicate upload batch without manual DB surgery.
- A day's stats are never half-imported — either both reports for that day are ingested, or neither is.
- Rollback is automatic on failure; no "retry just the second file" state.

## Non-Goals

- Soft delete / undo. Deletion is permanent. Re-upload the files if needed (file-hash dedup is bypassed with the existing "import anyway" flow).
- Editing an upload's metadata after import.
- Retroactively pairing existing (grandfathered) uploads.
- Server-side (RPC) transactional import. Rollback is client-orchestrated via cascade delete.

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│  UploadCenter.tsx                                              │
│  ┌────────────────┐  ┌────────────────┐                       │
│  │ Daily Call drop│  │ Deer Dama drop │  ← two slots          │
│  └────────────────┘  └────────────────┘                       │
│  [ Import Batch ]  ← disabled until both slots filled         │
│                                                                │
│  History table (admin sees trash icon per batch)              │
└───────────────────────────────────────────────────────────────┘
            │                                      │
            ▼                                      ▼
  importBatch()                           deleteBatch()
            │                                      │
            ▼                                      ▼
  importDailyCallReport(batchId)          DELETE FROM uploads
  importDeerDamaReport(batchId)                WHERE batch_id = ?
  │                                                │
  │ (on failure)                                   │
  ▼                                                ▼
  deleteUpload(firstId) ─────► DB cascade wipes derived rows
```

## Data Model Changes

Single migration file, applied via Lovable.

### 1. Add `ON DELETE CASCADE` to `source_upload_id` foreign keys

Six tables reference `uploads(id)` without cascade today. Each constraint is dropped and re-added with cascade:

- `lead_identity_links.source_upload_id`
- `lead_staff_history.source_upload_id`
- `call_events.source_upload_id`
- `status_events.source_upload_id`
- `quote_events.source_upload_id`
- `callback_events.source_upload_id`

`raw_daily_call_rows.upload_id` and `raw_deer_dama_rows.upload_id` already cascade — no change needed.

### 2. Add `batch_id` column to `uploads`

```sql
ALTER TABLE public.uploads
  ADD COLUMN batch_id UUID;

CREATE INDEX uploads_agency_batch_idx
  ON public.uploads (agency_id, batch_id)
  WHERE batch_id IS NOT NULL;
```

Nullable because any grandfathered rows predate the feature. New imports always populate it; both rows in a pair share the same `batch_id`.

### 3. RLS policy: only admins can delete

No new policy is added. The pre-existing `"Admin full access to uploads"` policy (migration `20260322220909`) already grants admins `FOR ALL` on `uploads`, which includes DELETE. Non-admins have no DELETE policy and are blocked by default.

## Import Service Changes (`src/lib/importService.ts`)

### New orchestrator

```ts
async function importBatch(
  dailyCallFile: File,
  deerDamaFile: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress: (p: BatchProgress) => void,
  force: boolean
): Promise<BatchResult>
```

Flow:

1. Generate `batchId = crypto.randomUUID()`.
2. Hash both files (SHA-256, existing helper). If either is a duplicate and `force === false`, return `{ duplicateOf: {...} }` without writing.
3. Call `importDailyCallReport(...)` with `batchId` threaded through.
4. On success, call `importDeerDamaReport(...)` with the same `batchId`.
5. **If step 4 fails** (throws or returns fatal error):
   - Call `deleteUpload(dailyCallUploadId)` — DB cascade wipes the first half's derived rows.
   - If the second file also wrote its `uploads` row before failing, `deleteBatch(batchId)` covers both.
   - Re-throw as `BatchRollbackError` with the original cause.
6. On success, return combined `BatchResult`.

### Signature updates

- `importDailyCallReport` gains a `batchId: string` parameter, inserted into `uploads.batch_id`.
- `importDeerDamaReport` gains the same parameter.
- No other behavior changes in the per-file importers.

### New types

```ts
type BatchProgress = {
  currentFile: 'daily_call' | 'deer_dama';
  fileIndex: 1 | 2;
  phase: ImportProgress['phase'];
  rowsProcessed: number;
  rowsTotal: number;
};

type BatchResult = {
  batchId: string;
  dailyCall: ImportResult;
  deerDama: ImportResult;
  rolledBack: boolean;
  duplicateOf?: { dailyCall?: ImportResult['duplicateOf']; deerDama?: ImportResult['duplicateOf'] };
};
```

### New helpers

```ts
async function deleteUpload(uploadId: string): Promise<void>;
async function deleteBatch(batchId: string): Promise<void>;
```

Both issue a `DELETE` against `public.uploads`. DB cascade handles the rest. `deleteBatch` is what the UI's trash button calls.

## UI Changes

### `UploadCenter.tsx` — Select step

- Replace single report-type `<select>` with two fixed-label drop slots rendered side-by-side.
- One **Upload Date** input above the slots (applies to both).
- One **Notes** input above the slots (applies to both).
- Each slot:
  - Empty state: dashed border, "Drop Daily Call Report here" (or "Deer Dama").
  - Populated state: filename, row count, checkmark, "×" to clear.
  - On drop: run `parseFile` + `detectReportType`; if type mismatches the slot, show an inline warning + "Swap slots" action.
- **Import Batch** button at the bottom. Disabled unless:
  - Both slots hold a file
  - Both files' detected types match their slots
  - `uploadDate` is set

### Preview step

- Stacked layout: "Daily Call Report" header → column list + 5-row preview table → "Deer Dama (Lead) Report" header → same.
- Duplicate-detection dialog reused; fires per file if both hit.

### Importing step

- Single progress bar: "Importing batch — file X of 2 (phase)"
- `BatchProgress` updates drive it.

### Summary step

- Combined totals + per-file sub-tables.
- Error list merged.
- If `rolledBack === true`: red banner "Batch rolled back — no data was imported" with the failing-file error detail.

### Upload history table

- Rows grouped by `batch_id`: each batch renders as two lines sharing a subtle left border and a common trash icon on the right (the trash icon acts on the whole batch).
- Admin-only visibility for the trash icon (`useAuth().isAdmin`).
- Trash icon opens confirm dialog (existing `AlertDialog`):
  - Title: "Delete this upload batch?"
  - Body: lists both filenames, upload date, combined row count. Warning line: "All stats derived from these files will be removed. This cannot be undone."
  - Buttons: "Cancel" (outline) / "Delete batch" (destructive).
- On confirm: call `deleteBatch(batchId)`, then invalidate React Query keys `['uploads']`, `['leads']`, `['leadList']`, `['staffPerf']`.
- Toast: "Upload batch deleted." on success; error message on failure.

### Component decomposition

The existing `UploadCenter.tsx` (~435 lines) will grow meaningfully. Extract two subcomponents to keep the main file focused:

- `<BatchDropSlot />` — the drop-zone UI for one report type.
- `<UploadHistoryRow />` — a single batch row in the history table, including the admin-only trash button.

## Error Handling & Edge Cases

1. **One file is a duplicate.** Existing duplicate-prompt dialog fires. If the user overrides, `importBatch` re-runs with `force: true` (applies to both halves — matches current single-file force semantics where file_hash is inserted as NULL).
2. **Both files are duplicates.** Two dialogs in sequence, or a combined dialog listing both. Implementation choice during coding; spec allows either.
3. **Parse error on one file at select time.** Only that slot shows the error; the other slot keeps its file; Import button stays disabled.
4. **Second file fails mid-import.** `deleteUpload` on the first half, re-throw error. Summary step shows the rolled-back banner.
5. **Network failure during rollback.** Surface the error to the user with a message pointing at the orphaned first-half batch_id so an admin can delete it manually.
6. **User tries to delete a batch mid-import.** Not possible — trash icon is only on completed history rows.
7. **Grandfathered uploads.** None expected post clean-slate; if any exist, they render as standalone rows without a trash icon (no `batch_id` means no batch to delete atomically).

## Security

- Admin-only DELETE is enforced by the pre-existing `"Admin full access to uploads"` FOR ALL policy; non-admins have no DELETE policy and are blocked by RLS regardless of UI visibility.
- The trash button is also hidden from non-admins, so the affordance matches the permission.
- All existing RLS read/insert/update policies on `uploads` remain unchanged.

## Rollout Order

1. Migration applied via Lovable (cascade FKs + `batch_id` + admin DELETE policy).
2. Ship delete feature (trash button + `deleteBatch` helper + admin gating).
3. Ship paired import (rewrites Upload Center select/preview/importing/summary steps + `importBatch` + per-file `batchId` threading).
4. Admin uses the delete feature to clean out existing unpaired uploads.

Steps 2 and 3 can be a single PR; keeping them numbered here clarifies dependencies.

## Testing

No existing automated test infrastructure (one placeholder Vitest file). Manual browser verification covers:

- Happy path: drop both files → preview → import → both appear in history as one batch.
- Duplicate on one half: dialog fires; confirm overrides; batch imports.
- Parse error on one file: slot shows error; other slot keeps file; import stays disabled.
- Rollback: force a failure in the second importer; verify the first half's `uploads` row and derived rows (`call_events`, `lead_status_events`) are gone.
- Admin delete: click trash on a batch → confirm → batch gone → stats refetch reflects the removal.
- Non-admin user: no trash icon visible; direct `deleteBatch` call (via devtools) is rejected by RLS.

## Open Questions

None at spec time. Flag during implementation if any of the edge-case error copy needs UX polish.
