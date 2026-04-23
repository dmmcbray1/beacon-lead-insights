# Delete Uploads & Paired Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins delete upload batches (with full cascade of derived stats) and force Daily Call + Deer Dama reports to be imported together as an atomic batch that rolls back on failure.

**Architecture:** One migration adds `ON DELETE CASCADE` to six `source_upload_id` FKs, adds a `batch_id UUID` column to `uploads`, and adds an admin-only DELETE RLS policy. A new `importBatch` orchestrator in `importService.ts` runs the two existing per-file importers sequentially, tags both `uploads` rows with the same `batch_id`, and cascade-deletes the first half if the second fails. The Upload Center UI is reworked around two side-by-side drop slots and a batch-aware history table with admin-gated trash buttons.

**Tech Stack:** React + TypeScript, Supabase (Postgres + RLS), React Query, shadcn/ui, Lovable (applies migrations).

**Testing note:** No automated test harness in this project (one placeholder Vitest file). Verification in this plan is typecheck + lint + manual browser runs. Do NOT add test scaffolding as part of this work.

**Spec:** `docs/superpowers/specs/2026-04-23-uploads-delete-and-paired-import-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260423120000_uploads_delete_and_batching.sql`

**Context:** Six tables reference `uploads(id)` without cascade. The admin role helper `public.has_role(auth.uid(), 'admin')` already exists (from `20260322220909_*.sql`). Supabase migrations for this project are applied via Lovable — the file is checked into git but NOT pushed via `supabase db push` or the CLI.

- [ ] **Step 1: Create the migration file**

Write this exact content to `supabase/migrations/20260423120000_uploads_delete_and_batching.sql`:

```sql
-- 1. Cascade derived rows when an upload is deleted.
--    Six tables reference uploads(id) without ON DELETE CASCADE today.
--    Drop and re-add each FK with cascade so deleting an upload wipes its
--    stats rows automatically.

ALTER TABLE public.lead_identities
  DROP CONSTRAINT IF EXISTS lead_identities_source_upload_id_fkey,
  ADD CONSTRAINT lead_identities_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.lead_staff_assignments
  DROP CONSTRAINT IF EXISTS lead_staff_assignments_source_upload_id_fkey,
  ADD CONSTRAINT lead_staff_assignments_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.call_events
  DROP CONSTRAINT IF EXISTS call_events_source_upload_id_fkey,
  ADD CONSTRAINT call_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.lead_status_events
  DROP CONSTRAINT IF EXISTS lead_status_events_source_upload_id_fkey,
  ADD CONSTRAINT lead_status_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.quote_events
  DROP CONSTRAINT IF EXISTS quote_events_source_upload_id_fkey,
  ADD CONSTRAINT quote_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.callback_events
  DROP CONSTRAINT IF EXISTS callback_events_source_upload_id_fkey,
  ADD CONSTRAINT callback_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

-- 2. Batch column — links the two uploads of a paired import.
ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS uploads_agency_batch_idx
  ON public.uploads (agency_id, batch_id)
  WHERE batch_id IS NOT NULL;

-- 3. Admin-only DELETE policy.
CREATE POLICY "Admins can delete uploads"
  ON public.uploads
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

- [ ] **Step 2: Regenerate Supabase types**

The `uploads` table gains `batch_id`. Regenerate `src/integrations/supabase/types.ts` so TypeScript sees the column. If the project has a scripted regeneration step, use it; otherwise edit the file by hand, adding `batch_id: string | null` to the `uploads` Row/Insert/Update types (search for existing `uploads:` definition as a template).

Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: passes.

- [ ] **Step 3: Apply migration via Lovable**

Per the project's established workflow (memory: "DB sync goes through Lovable"), do NOT run `supabase db push`. Apply the migration through Lovable's SQL runner or have the user apply it. Confirm the column and policy exist:

```sql
SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='uploads' AND column_name='batch_id';
-- Expect: batch_id

SELECT polname FROM pg_policy WHERE polrelid = 'public.uploads'::regclass;
-- Expect includes: Admins can delete uploads
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423120000_uploads_delete_and_batching.sql src/integrations/supabase/types.ts
git commit -m "Add cascade FKs, batch_id, and admin delete policy to uploads"
```

---

## Task 2: Delete helpers in importService

**Files:**
- Modify: `src/lib/importService.ts` (add two exported functions)

**Context:** The service imports the Supabase client already. With Task 1's cascade FKs in place, a simple DELETE against `uploads` handles everything.

- [ ] **Step 1: Add `deleteUpload` and `deleteBatch` exports**

Append to the bottom of `src/lib/importService.ts`:

```ts
/**
 * Delete a single upload row. Cascade FKs wipe all derived rows
 * (call_events, lead_status_events, lead_identities, lead_staff_assignments,
 * quote_events, callback_events) and the raw_*_rows staging tables.
 *
 * Throws on RLS denial or network error.
 */
export async function deleteUpload(uploadId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('id', uploadId);
  if (error) throw new Error('Failed to delete upload: ' + error.message);
}

/**
 * Delete both uploads in a batch in one query. Used by the Upload Center
 * trash button and by importBatch's rollback path.
 */
export async function deleteBatch(batchId: string): Promise<void> {
  const { error } = await supabase.from('uploads').delete().eq('batch_id', batchId);
  if (error) throw new Error('Failed to delete upload batch: ' + error.message);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Add deleteUpload and deleteBatch helpers"
```

---

## Task 3: Thread `batchId` through per-file importers

**Files:**
- Modify: `src/lib/importService.ts:275` (signature of `importDailyCallReport`) and its `uploads.insert` block around line 315
- Modify: `src/lib/importService.ts:741` (signature of `importDeerDamaReport`) and its `uploads.insert` block around line 780

**Context:** Both importers currently insert into `uploads` without a `batch_id`. We add an optional parameter and write it through.

- [ ] **Step 1: Update `importDailyCallReport` signature**

Change the current signature:

```ts
export async function importDailyCallReport(
  file: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress?: (p: ImportProgress) => void,
  force = false,
): Promise<ImportResult> {
```

to:

```ts
export async function importDailyCallReport(
  file: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress?: (p: ImportProgress) => void,
  force = false,
  batchId: string | null = null,
): Promise<ImportResult> {
```

- [ ] **Step 2: Add `batch_id` to the Daily Call `uploads.insert`**

Find the insert block around line 315 (`.from('uploads').insert({ ... })`). Add `batch_id: batchId,` to the inserted object alongside the other fields. Final block:

```ts
.from('uploads')
.insert({
  agency_id: agencyId,
  file_name: file.name,
  report_type: REPORT_TYPES.DAILY_CALL,
  upload_date: uploadDate,
  notes,
  status: 'processing',
  row_count: rows.length,
  file_hash: force ? null : fileHash,
  batch_id: batchId,
})
```

- [ ] **Step 3: Update `importDeerDamaReport` signature (same shape)**

Apply the identical change to `importDeerDamaReport` at line 741 — add the `batchId: string | null = null` parameter.

- [ ] **Step 4: Add `batch_id` to the Deer Dama `uploads.insert`**

Find the insert block around line 780 and add `batch_id: batchId,` to the inserted object. Final block matches Daily Call except `report_type: REPORT_TYPES.DEER_DAMA`.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes. All existing callers use positional args through the first six parameters, so the new optional 7th parameter is backward-compatible.

- [ ] **Step 6: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Thread batch_id through per-file importers"
```

---

## Task 4: `BatchProgress` and `BatchResult` types

**Files:**
- Modify: `src/lib/importService.ts` (add type exports near existing `ImportProgress`/`ImportResult` definitions around line 26)

- [ ] **Step 1: Add new type exports**

Immediately after the existing `ImportResult` interface (ends around line 52), add:

```ts
export interface BatchProgress {
  currentFile: 'daily_call' | 'deer_dama';
  fileIndex: 1 | 2;
  phase: string;
  processed: number;
  total: number;
}

export interface BatchResult {
  batchId: string;
  dailyCall: ImportResult;
  deerDama: ImportResult;
  rolledBack: boolean;
  rollbackError?: string;
  /**
   * Populated when either file is a duplicate of a previously-imported file
   * and `force` was false. When set, no rows were imported for either file —
   * the caller should prompt the user and re-invoke importBatch with force: true.
   */
  duplicateOf?: {
    dailyCall?: { uploadId: string; fileName: string; uploadDate: string };
    deerDama?: { uploadId: string; fileName: string; uploadDate: string };
  };
}

export class BatchRollbackError extends Error {
  constructor(
    public readonly failedFile: 'daily_call' | 'deer_dama',
    public readonly originalError: Error,
    public readonly rollbackError?: Error,
  ) {
    super(
      `Batch failed on ${failedFile}: ${originalError.message}` +
        (rollbackError ? ` (rollback also failed: ${rollbackError.message})` : ''),
    );
    this.name = 'BatchRollbackError';
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Add BatchProgress, BatchResult, BatchRollbackError types"
```

---

## Task 5: `importBatch` orchestrator

**Files:**
- Modify: `src/lib/importService.ts` (add new exported function at end of file, before `deleteUpload`/`deleteBatch`)

**Context:** Orchestrates the two per-file importers under a shared `batch_id`, handles duplicate detection on both files before writing anything, and rolls back via `deleteUpload` / `deleteBatch` on failure.

- [ ] **Step 1: Add the orchestrator**

Add this function to `src/lib/importService.ts`, placed above the `deleteUpload` / `deleteBatch` helpers:

```ts
/**
 * Import a Daily Call Report and a Deer Dama (Lead) Report as an atomic batch.
 * Both uploads share a batch_id. If the second importer fails, the first
 * upload is cascade-deleted so no half-imported state remains.
 */
export async function importBatch(
  dailyCallFile: File,
  deerDamaFile: File,
  agencyId: string,
  uploadDate: string,
  notes: string,
  onProgress: (p: BatchProgress) => void,
  force: boolean,
): Promise<BatchResult> {
  const batchId = crypto.randomUUID();

  // Duplicate check both files BEFORE any write so we can prompt once.
  if (!force) {
    const [dailyHash, deerHash] = await Promise.all([
      hashFile(dailyCallFile),
      hashFile(deerDamaFile),
    ]);
    const [dailyDupe, deerDupe] = await Promise.all([
      findDuplicateUpload(dailyHash, agencyId),
      findDuplicateUpload(deerHash, agencyId),
    ]);
    if (dailyDupe || deerDupe) {
      return {
        batchId,
        dailyCall: emptyResult(),
        deerDama: emptyResult(),
        rolledBack: false,
        duplicateOf: {
          dailyCall: dailyDupe ?? undefined,
          deerDama: deerDupe ?? undefined,
        },
      };
    }
  }

  // Phase 1: Daily Call
  const dailyCall = await importDailyCallReport(
    dailyCallFile,
    agencyId,
    uploadDate,
    notes,
    (p) => onProgress({ currentFile: 'daily_call', fileIndex: 1, ...p }),
    force,
    batchId,
  );

  if (dailyCall.errors.length > 0 && dailyCall.rowsImported === 0) {
    // Daily Call failed outright — nothing to roll back (the uploads row was
    // inserted with status='processing' but derived data wasn't; still wipe
    // via batch_id for cleanliness).
    await safeRollback(batchId);
    throw new BatchRollbackError(
      'daily_call',
      new Error(dailyCall.errors.join('; ')),
    );
  }

  // Phase 2: Deer Dama
  let deerDama: ImportResult;
  try {
    deerDama = await importDeerDamaReport(
      deerDamaFile,
      agencyId,
      uploadDate,
      notes,
      (p) => onProgress({ currentFile: 'deer_dama', fileIndex: 2, ...p }),
      force,
      batchId,
    );
  } catch (err) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'deer_dama',
      err instanceof Error ? err : new Error(String(err)),
      rollbackErr ?? undefined,
    );
  }

  if (deerDama.errors.length > 0 && deerDama.rowsImported === 0) {
    const rollbackErr = await safeRollback(batchId);
    throw new BatchRollbackError(
      'deer_dama',
      new Error(deerDama.errors.join('; ')),
      rollbackErr ?? undefined,
    );
  }

  return { batchId, dailyCall, deerDama, rolledBack: false };
}

/** Fire-and-forget rollback; returns the error (if any) without throwing. */
async function safeRollback(batchId: string): Promise<Error | null> {
  try {
    await deleteBatch(batchId);
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

function emptyResult(): ImportResult {
  return {
    uploadId: '',
    rowsTotal: 0,
    rowsImported: 0,
    rowsFiltered: 0,
    rowsSkipped: 0,
    newLeads: 0,
    updatedLeads: 0,
    errors: [],
  };
}
```

- [ ] **Step 2: Verify `hashFile` is already a helper**

The existing `importDailyCallReport` hashes files internally. If `hashFile` isn't already factored out into a module-level function, extract it from one of the importers so `importBatch` can reuse it without a second read of the File. Run:

```
grep -n "hashFile\|arrayBufferToHex\|SHA-256\|sha-256" src/lib/importService.ts
```

If no reusable `hashFile(file: File): Promise<string>` exists, add one using the existing in-line hashing logic from `importDailyCallReport` (search for `crypto.subtle.digest` inside that function). Place it near `findDuplicateUpload` at the top of the file.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Add importBatch orchestrator with rollback"
```

---

## Task 6: Extract `<BatchDropSlot />` component

**Files:**
- Create: `src/components/upload/BatchDropSlot.tsx`

**Context:** Single drop-zone UI that renders one of the two slots. Keeps the main UploadCenter file focused.

- [ ] **Step 1: Create the component**

Write to `src/components/upload/BatchDropSlot.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { FileSpreadsheet, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseFile } from '@/lib/importService';
import { REPORT_TYPES, DAILY_CALL_COLUMNS, DEER_DAMA_COLUMNS } from '@/lib/constants';

export interface BatchDropSlotValue {
  file: File;
  columns: string[];
  previewRows: Record<string, string>[];
  detectedType: string;
  typeMatches: boolean;
}

interface Props {
  expectedType: typeof REPORT_TYPES.DAILY_CALL | typeof REPORT_TYPES.DEER_DAMA;
  label: string;
  value: BatchDropSlotValue | null;
  onChange: (value: BatchDropSlotValue | null) => void;
  onError?: (message: string) => void;
}

function detectReportType(columns: string[]): string {
  const colSet = new Set(columns.map((c) => c.toLowerCase().trim()));
  const dailyMatch = DAILY_CALL_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  const deerMatch = DEER_DAMA_COLUMNS.filter((c) => colSet.has(c.toLowerCase())).length;
  if (deerMatch > dailyMatch && deerMatch >= 5) return REPORT_TYPES.DEER_DAMA;
  if (dailyMatch >= 5) return REPORT_TYPES.DAILY_CALL;
  return '';
}

export default function BatchDropSlot({ expectedType, label, value, onChange, onError }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const rows = await parseFile(file);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const previewRows = rows.slice(0, 5).map((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])),
        ) as Record<string, string>[];
        const detectedType = detectReportType(columns);
        onChange({
          file,
          columns,
          previewRows,
          detectedType,
          typeMatches: detectedType === expectedType,
        });
      } catch (err) {
        onError?.('Could not read file: ' + String(err));
      }
    },
    [expectedType, onChange, onError],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  if (value) {
    return (
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                {value.file.name}
              </p>
            </div>
          </div>
          <button
            onClick={() => onChange(null)}
            className="p-1 rounded hover:bg-muted"
            aria-label="Remove file"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {value.typeMatches ? (
          <div className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Detected as {label}
          </div>
        ) : (
          <div className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              This looks like a different report type. Remove it and drop it into the other slot.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground mb-3">Drop CSV or Excel file here</p>
      <label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button variant="outline" size="sm" asChild>
          <span>Browse</span>
        </Button>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/upload/BatchDropSlot.tsx
git commit -m "Add BatchDropSlot component for paired upload UI"
```

---

## Task 7: Rewrite UploadCenter — select + preview steps

**Files:**
- Modify: `src/pages/UploadCenter.tsx` (substantial rewrite — keep the shape but swap single-file flow for batch)

**Context:** The new select step shows one upload-date + notes field plus two drop slots. Preview step renders both files stacked.

- [ ] **Step 1: Update state shape and imports**

Near the top of `UploadCenter.tsx`, replace the current `UploadState` type, `initialState`, and `detectReportType` helper with:

```tsx
import BatchDropSlot, { type BatchDropSlotValue } from '@/components/upload/BatchDropSlot';
import { REPORT_TYPES } from '@/lib/constants';
import {
  importBatch,
  type BatchProgress,
  type BatchResult,
  BatchRollbackError,
} from '@/lib/importService';

type Step = 'select' | 'preview' | 'importing' | 'summary';

interface BatchState {
  dailyCall: BatchDropSlotValue | null;
  deerDama: BatchDropSlotValue | null;
  uploadDate: string;
  notes: string;
  step: Step;
  progress: BatchProgress | null;
  result: BatchResult | null;
  rollbackMessage: string | null;
}

const initialState: BatchState = {
  dailyCall: null,
  deerDama: null,
  uploadDate: new Date().toISOString().split('T')[0],
  notes: '',
  step: 'select',
  progress: null,
  result: null,
  rollbackMessage: null,
};
```

Remove the old `detectReportType` function (moved into `BatchDropSlot`) and the old `UploadState` type. Remove any now-unused imports (`Upload`, `FileSpreadsheet`, etc. — re-add only the ones you still use after this rewrite).

- [ ] **Step 2: Replace the select step JSX**

Find the `{state.step === 'select' && (` block (starts around line 161 in the current file). Replace its inner content with:

```tsx
<div className="max-w-3xl">
  <div className="grid grid-cols-2 gap-4 mb-6">
    <div>
      <label className="text-sm font-medium text-foreground mb-1.5 block">Upload Date</label>
      <input
        type="date"
        value={state.uploadDate}
        onChange={(e) => setState((prev) => ({ ...prev, uploadDate: e.target.value }))}
        className="w-full bg-card border rounded-md px-3 py-2 text-sm"
      />
    </div>
    <div>
      <label className="text-sm font-medium text-foreground mb-1.5 block">Notes (optional)</label>
      <input
        type="text"
        value={state.notes}
        onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
        placeholder="e.g. Morning batch, Apr 23"
        className="w-full bg-card border rounded-md px-3 py-2 text-sm"
      />
    </div>
  </div>

  <div className="grid grid-cols-2 gap-4">
    <BatchDropSlot
      expectedType={REPORT_TYPES.DAILY_CALL}
      label="Daily Call Report"
      value={state.dailyCall}
      onChange={(v) => setState((prev) => ({ ...prev, dailyCall: v }))}
    />
    <BatchDropSlot
      expectedType={REPORT_TYPES.DEER_DAMA}
      label="Deer Dama (Lead) Report"
      value={state.deerDama}
      onChange={(v) => setState((prev) => ({ ...prev, deerDama: v }))}
    />
  </div>

  <div className="mt-6 flex justify-end">
    <Button
      onClick={() => setState((prev) => ({ ...prev, step: 'preview' }))}
      disabled={
        !state.dailyCall ||
        !state.deerDama ||
        !state.dailyCall.typeMatches ||
        !state.deerDama.typeMatches ||
        !state.uploadDate
      }
    >
      Continue to Preview
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Replace the preview step JSX**

Find the `{state.step === 'preview' && (` block. Replace with two stacked preview tables — one per file. Reuse whatever table styling the existing preview step uses. Shape:

```tsx
<div className="max-w-4xl space-y-8">
  {(['dailyCall', 'deerDama'] as const).map((key) => {
    const slot = state[key];
    if (!slot) return null;
    const label = key === 'dailyCall' ? 'Daily Call Report' : 'Deer Dama (Lead) Report';
    return (
      <div key={key}>
        <h2 className="text-base font-semibold text-foreground mb-2">{label}</h2>
        <p className="text-xs text-muted-foreground mb-3">
          {slot.file.name} — {slot.columns.length} columns
        </p>
        <div className="border rounded-md overflow-auto max-h-[240px]">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                {slot.columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slot.previewRows.map((row, i) => (
                <tr key={i} className="border-t">
                  {slot.columns.map((c) => (
                    <td key={c} className="px-3 py-1.5 text-foreground">{row[c]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  })}

  <div className="flex justify-between pt-4">
    <Button variant="outline" onClick={() => setState((prev) => ({ ...prev, step: 'select' }))}>
      Back
    </Button>
    <Button onClick={handleImport}>Import Batch</Button>
  </div>
</div>
```

- [ ] **Step 4: Typecheck (expect errors — handleImport not yet wired)**

Run: `npm run typecheck`
Expected: one error about `handleImport` — that's fixed in Task 8.

- [ ] **Step 5: (Do NOT commit yet — wait until Task 8 so UI compiles.)**

---

## Task 8: Wire `runBatch` import flow + duplicate prompt

**Files:**
- Modify: `src/pages/UploadCenter.tsx` (add handlers)

- [ ] **Step 1: Replace the old `runImport` / `handleImport` with a batch version**

Inside the component (after the `useState` calls), add:

```tsx
const [duplicatePrompt, setDuplicatePrompt] = useState<BatchResult['duplicateOf'] | null>(null);

const runBatch = async (force: boolean) => {
  if (!state.dailyCall || !state.deerDama || !agencyId) return;
  setState((prev) => ({ ...prev, step: 'importing', progress: null, rollbackMessage: null }));

  const onProgress = (p: BatchProgress) => {
    setState((prev) => ({ ...prev, progress: p }));
  };

  try {
    const result = await importBatch(
      state.dailyCall.file,
      state.deerDama.file,
      agencyId,
      state.uploadDate,
      state.notes,
      onProgress,
      force,
    );

    if (result.duplicateOf && !force) {
      setDuplicatePrompt(result.duplicateOf);
      setState((prev) => ({ ...prev, step: 'preview', progress: null }));
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['leads'] });
    await queryClient.invalidateQueries({ queryKey: ['staffPerf'] });
    await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    await queryClient.invalidateQueries({ queryKey: ['leadList'] });

    setState((prev) => ({ ...prev, step: 'summary', result }));
  } catch (err) {
    const message =
      err instanceof BatchRollbackError
        ? err.message
        : 'Batch import failed: ' + String(err);
    await queryClient.invalidateQueries({ queryKey: ['uploads'] });
    setState((prev) => ({
      ...prev,
      step: 'summary',
      rollbackMessage: message,
      result: {
        batchId: '',
        dailyCall: { uploadId: '', rowsTotal: 0, rowsImported: 0, rowsFiltered: 0, rowsSkipped: 0, newLeads: 0, updatedLeads: 0, errors: [] },
        deerDama: { uploadId: '', rowsTotal: 0, rowsImported: 0, rowsFiltered: 0, rowsSkipped: 0, newLeads: 0, updatedLeads: 0, errors: [] },
        rolledBack: true,
      },
    }));
  }
};

const handleImport = () => runBatch(false);

const handleDuplicateConfirm = () => {
  setDuplicatePrompt(null);
  void runBatch(true);
};

const handleDuplicateCancel = () => setDuplicatePrompt(null);

const reset = () => {
  setDuplicatePrompt(null);
  setState(initialState);
};
```

- [ ] **Step 2: Update the duplicate AlertDialog**

Find the existing `<AlertDialog>` that handles duplicates (search for `duplicatePrompt` or `AlertDialogContent` in the file). Change its body to list whichever file(s) matched:

```tsx
<AlertDialog open={!!duplicatePrompt} onOpenChange={(open) => !open && handleDuplicateCancel()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Duplicate file detected</AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-2">
          {duplicatePrompt?.dailyCall && (
            <p>
              The Daily Call file matches a previous import:{' '}
              <strong>{duplicatePrompt.dailyCall.fileName}</strong> ({duplicatePrompt.dailyCall.uploadDate}).
            </p>
          )}
          {duplicatePrompt?.deerDama && (
            <p>
              The Deer Dama file matches a previous import:{' '}
              <strong>{duplicatePrompt.deerDama.fileName}</strong> ({duplicatePrompt.deerDama.uploadDate}).
            </p>
          )}
          <p>Import anyway?</p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={handleDuplicateCancel}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDuplicateConfirm}>Import Anyway</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UploadCenter.tsx
git commit -m "Rewrite Upload Center for paired batch imports"
```

---

## Task 9: Rewrite importing + summary steps

**Files:**
- Modify: `src/pages/UploadCenter.tsx`

- [ ] **Step 1: Importing step**

Find the `{state.step === 'importing' && (` block. Replace with:

```tsx
<div className="max-w-2xl">
  <div className="flex items-center gap-3 mb-4">
    <Loader2 className="w-5 h-5 animate-spin text-primary" />
    <div>
      <p className="text-sm font-medium text-foreground">
        Importing batch
        {state.progress && ` — file ${state.progress.fileIndex} of 2`}
      </p>
      <p className="text-xs text-muted-foreground">
        {state.progress
          ? `${state.progress.currentFile === 'daily_call' ? 'Daily Call' : 'Deer Dama'}: ${state.progress.phase} (${state.progress.processed}/${state.progress.total})`
          : 'Starting…'}
      </p>
    </div>
  </div>
  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
    <div
      className="h-full bg-primary transition-all"
      style={{
        width: state.progress
          ? `${Math.min(100, ((state.progress.fileIndex - 1) * 50) + ((state.progress.processed / Math.max(1, state.progress.total)) * 50))}%`
          : '0%',
      }}
    />
  </div>
</div>
```

- [ ] **Step 2: Summary step**

Find the `{state.step === 'summary' && (` block. Replace with:

```tsx
<div className="max-w-3xl">
  {state.rollbackMessage ? (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 mb-6">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Batch rolled back</p>
          <p className="text-xs text-destructive/80 mt-1">{state.rollbackMessage}</p>
          <p className="text-xs text-muted-foreground mt-2">
            No data was imported. Fix the issue and try again.
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div className="rounded-md border border-success/50 bg-success/10 p-4 mb-6">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-success" />
        <p className="text-sm font-medium text-success">Batch imported successfully</p>
      </div>
    </div>
  )}

  {state.result && !state.rollbackMessage && (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {(['dailyCall', 'deerDama'] as const).map((key) => {
        const r = state.result![key];
        const title = key === 'dailyCall' ? 'Daily Call Report' : 'Deer Dama (Lead) Report';
        return (
          <div key={key} className="border rounded-md p-4 bg-card">
            <p className="text-sm font-medium text-foreground mb-2">{title}</p>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Rows imported</dt>
              <dd className="text-right tabular-nums">{r.rowsImported}</dd>
              <dt className="text-muted-foreground">Filtered</dt>
              <dd className="text-right tabular-nums">{r.rowsFiltered}</dd>
              <dt className="text-muted-foreground">Skipped</dt>
              <dd className="text-right tabular-nums">{r.rowsSkipped}</dd>
              <dt className="text-muted-foreground">New leads</dt>
              <dd className="text-right tabular-nums">{r.newLeads}</dd>
              <dt className="text-muted-foreground">Updated leads</dt>
              <dd className="text-right tabular-nums">{r.updatedLeads}</dd>
            </dl>
            {r.errors.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="text-warning cursor-pointer">{r.errors.length} warnings</summary>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {r.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  )}

  <div className="flex justify-end">
    <Button onClick={reset}>Upload another batch</Button>
  </div>
</div>
```

Import `AlertTriangle` and `CheckCircle2` from `lucide-react` if they're not already imported (they are in the current file — verify after changes).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UploadCenter.tsx
git commit -m "Add batch importing and summary steps"
```

---

## Task 10: `<UploadHistoryRow />` — admin delete button + grouping

**Files:**
- Create: `src/components/upload/UploadHistoryRow.tsx`
- Modify: `src/pages/UploadCenter.tsx` (use the new component, group rows by batch_id)

- [ ] **Step 1: Create the component**

Write to `src/components/upload/UploadHistoryRow.tsx`:

```tsx
import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { deleteBatch, deleteUpload } from '@/lib/importService';
import { REPORT_TYPES } from '@/lib/constants';

export interface UploadRow {
  id: string;
  file_name: string;
  report_type: string;
  upload_date: string;
  row_count: number | null;
  matched_count: number | null;
  status: string;
  batch_id: string | null;
}

interface Props {
  batchId: string | null;   // null means grandfathered single-row entry
  rows: UploadRow[];        // 1 row if grandfathered, 2 if paired
  isAdmin: boolean;
}

export default function UploadHistoryRow({ batchId, rows, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (batchId) {
        await deleteBatch(batchId);
      } else {
        await deleteUpload(rows[0].id);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['uploads'] }),
        queryClient.invalidateQueries({ queryKey: ['leads'] }),
        queryClient.invalidateQueries({ queryKey: ['leadList'] }),
        queryClient.invalidateQueries({ queryKey: ['staffPerf'] }),
      ]);
      toast.success(batchId ? 'Upload batch deleted.' : 'Upload deleted.');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const combinedRowCount = rows.reduce((sum, r) => sum + (r.row_count ?? 0), 0);
  const combinedMatched = rows.reduce((sum, r) => sum + (r.matched_count ?? 0), 0);

  return (
    <>
      {rows.map((row, idx) => (
        <tr
          key={row.id}
          className={`border-t hover:bg-muted/50 transition-colors ${
            batchId && idx === 0 ? 'border-l-2 border-l-primary/40' : ''
          } ${batchId && idx > 0 ? 'border-l-2 border-l-primary/40' : ''}`}
        >
          <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{row.file_name}</td>
          <td className="px-4 py-2.5 text-muted-foreground">
            {row.report_type === REPORT_TYPES.DAILY_CALL ? 'Daily Call' : 'Deer Dama'}
          </td>
          <td className="px-4 py-2.5 text-muted-foreground">{row.upload_date}</td>
          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.row_count ?? '—'}</td>
          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{row.matched_count ?? '—'}</td>
          <td className="px-4 py-2.5">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                row.status === 'complete'
                  ? 'bg-success/10 text-success'
                  : row.status === 'complete_with_errors'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {row.status === 'complete_with_errors' ? 'Errors' : row.status}
            </span>
          </td>
          <td className="px-4 py-2.5 text-right">
            {isAdmin && idx === 0 ? (
              <button
                onClick={() => setOpen(true)}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                aria-label="Delete upload batch"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : null}
          </td>
        </tr>
      ))}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchId ? 'Delete this upload batch?' : 'Delete this upload?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <ul className="text-sm space-y-1">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <strong>{r.file_name}</strong> — {r.upload_date} ({r.row_count ?? 0} rows)
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-medium">
                  Total rows affected: {combinedRowCount} ({combinedMatched} matched).
                </p>
                <p className="text-sm text-destructive">
                  All stats derived from {batchId ? 'these files' : 'this file'} will be removed.
                  This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Update `useUploadHistory` query to select `batch_id`**

Open `src/hooks/useLeadData.ts`, find `useUploadHistory` around line 544. The Supabase query likely does `.select('*')` or lists fields. Make sure `batch_id` is included (if `.select('*')` is used, nothing to do — it's already there post-migration + types regen).

- [ ] **Step 3: Use `UploadHistoryRow` in UploadCenter history table**

In `UploadCenter.tsx`, find the history table's `<tbody>` (around line 408 originally). Replace the inline `.map((row) => <tr>...)` with grouping logic:

```tsx
import UploadHistoryRow, { type UploadRow } from '@/components/upload/UploadHistoryRow';
// ...

const { isAdmin } = useAuth();

// Inside the render, before the table:
const historyRows = (uploadHistory.data ?? []) as UploadRow[];
const grouped: Array<{ batchId: string | null; rows: UploadRow[] }> = [];
const seen = new Set<string>();
for (const row of historyRows) {
  if (row.batch_id && !seen.has(row.batch_id)) {
    seen.add(row.batch_id);
    grouped.push({
      batchId: row.batch_id,
      rows: historyRows.filter((r) => r.batch_id === row.batch_id),
    });
  } else if (!row.batch_id) {
    grouped.push({ batchId: null, rows: [row] });
  }
}
```

Then in the `<tbody>`:

```tsx
<tbody>
  {uploadHistory.isLoading && /* existing skeletons */}
  {!uploadHistory.isLoading && grouped.length === 0 && (
    <tr>
      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
        No uploads yet
      </td>
    </tr>
  )}
  {grouped.map((group) => (
    <UploadHistoryRow
      key={group.batchId ?? group.rows[0].id}
      batchId={group.batchId}
      rows={group.rows}
      isAdmin={isAdmin}
    />
  ))}
</tbody>
```

Update the `<thead>` to have 7 columns (add an empty header for the trash column):

```tsx
<th className="px-4 py-2 w-10" aria-hidden="true"></th>
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/upload/UploadHistoryRow.tsx src/pages/UploadCenter.tsx src/hooks/useLeadData.ts
git commit -m "Group upload history by batch and add admin delete button"
```

---

## Task 11: Manual verification

**Files:** none

**Context:** No automated test harness. Run the feature in-browser against a Lovable-connected Supabase. The user must apply Task 1's migration via Lovable before these checks pass.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the Upload Center page as an admin.

- [ ] **Step 2: Happy path batch import**

- Drop a Daily Call CSV into the left slot and a Deer Dama CSV into the right slot with today's date.
- Click "Continue to Preview" → both preview tables render.
- Click "Import Batch" → progress bar shows "file 1 of 2" then "file 2 of 2."
- Summary step shows per-file counts.
- History table shows two rows grouped under a single batch border.

- [ ] **Step 3: Wrong-slot detection**

- Drop a Daily Call CSV into the Deer Dama slot.
- Expect: warning "This looks like a different report type…" and the "Continue" button stays disabled.

- [ ] **Step 4: Duplicate prompt on one half**

- Drop a Daily Call file that was previously imported, and a fresh Deer Dama file.
- Click "Continue" → "Import Batch."
- Expect: dialog lists only the Daily Call duplicate. Confirming imports both files.

- [ ] **Step 5: Rollback on failure**

- Drop a Daily Call CSV and a malformed Deer Dama CSV (e.g., an empty file or a file with wrong columns that causes the importer to throw).
- Click "Import Batch."
- Expect: summary step shows red "Batch rolled back" banner. In Supabase, verify no rows exist in `uploads` with today's batch_id and no rows in `call_events` reference either file.

- [ ] **Step 6: Admin delete**

- As admin, click the trash icon on a batch in the history table.
- Confirm in the dialog.
- Expect: toast "Upload batch deleted." History refetches (batch disappears). Stats on other pages (Lead Explorer, Staff Performance) drop their counts accordingly on next refetch.

- [ ] **Step 7: Non-admin delete hidden**

- Sign in as a customer (non-admin) role.
- Open the Upload Center.
- Expect: no trash icons visible on any history row.

- [ ] **Step 8: RLS server-side enforcement**

In browser devtools console (as a non-admin), run:

```js
await supabase.from('uploads').delete().eq('id', '<some-upload-id>');
```

Expected: no rows deleted (RLS blocks it); `data` is `[]` with no error (Supabase default behavior — the row simply doesn't match).

- [ ] **Step 9: Final commit**

If any adjustments were made during manual verification, commit them:

```bash
git add -A
git commit -m "Manual verification fixes for paired import and delete"
```

---

## Self-Review Notes

Written inline against the spec after drafting. Coverage check:

- ✅ Feature 1 delete — Tasks 1, 2, 10 (migration + helper + UI)
- ✅ Feature 2 paired import — Tasks 3, 4, 5, 6, 7, 8, 9
- ✅ Cascade FKs on six tables — Task 1 step 1
- ✅ `batch_id` column + index — Task 1 step 1
- ✅ Admin DELETE policy — Task 1 step 1
- ✅ Duplicate handling on both halves — Task 5 step 1 + Task 8 step 2
- ✅ Rollback on second-half failure — Task 5 step 1
- ✅ Admin-only trash icon — Task 10 step 1
- ✅ React Query invalidation — Task 8 step 1 + Task 10 step 1
- ✅ Component extraction for readability — Tasks 6 + 10
- ✅ Clean-slate migration posture — no data migration code (per spec non-goal)
- ✅ Manual verification (no test harness) — Task 11
