# Ricochet Lead List — Third Report in Paired Batch Upload

**Date:** 2026-04-23
**Status:** Approved — ready for implementation planning
**Project:** beacon-lead-insights

## 1. Problem & Goal

The current Upload Center imports two paired files per batch — the Daily Call Report and the Deer Damage (Lead) Report. Those two reports describe *activity* (calls made, damage surveys filled out) but they only surface leads that had activity on a given day. Leads that were loaded into Ricochet but had no activity yet are missing from the database, causing undercounting of the actual pipeline.

The goal is to add a third report — the **Ricochet Lead List** — as the authoritative seed of truth for leads. The Ricochet list contains every lead loaded into Ricochet the previous day. Uploading it alongside Daily Call and Deer Dama closes the gap: every lead we should know about comes from Ricochet, and the other two reports attach events to leads that Ricochet has already established.

## 2. Scope

**In scope:**
- Add a third drop slot + phase to the existing paired-batch upload flow.
- Create `leads` from the Ricochet file (or update them when blank-preserving rules permit).
- Detect phone matches against existing leads and open a review dialog so the user can choose per-row whether to treat each match as a requote (default) or overwrite the existing lead.
- Log every phone match to a new `lead_requote_events` table regardless of decision, so requote history is preserved.
- Surface DC/DD rows whose phone isn't in the `leads` table after Phase 0 as skipped rows in the summary (not a fatal error).
- Preserve the atomic-batch-with-rollback invariant across all three phases via shared `batch_id`.

**Out of scope (explicit, to prevent creep):**
- Lead detail page surfacing "Requoted N times" — data will be captured; the UI is a future feature.
- Bulk editing / re-assigning requoted leads.
- Ricochet-driven cleanup of leads *not* present in today's file.
- Backfilling historical Ricochet data.
- A standalone Ricochet-only upload flow for days that don't have DC/DD data.

## 3. Design Decisions (brainstorming outcomes)

| # | Decision | Rationale |
|---|---|---|
| 1 | Ricochet = seed of truth: creates/updates leads | Matches the user's stated intent that the list is authoritative |
| 2 | Unified 3-slot atomic batch with shared `batch_id` | Preserves the existing rollback pattern; one cascade-delete rolls back all three files |
| 3 | DC/DD rows for phones not in `leads` are skipped + reported, not fatal | Gaps are surfaced without one bad row blocking an upload |
| 4 | Promote identity + address + `campaign` + `lead_date` + `dwelling_value` + `home_value` + `lead_cost` to `leads`. Drop "Current expiration date." Everything else stays in `raw_ricochet_rows` | Matches the columns the user actually uses for segmentation and reporting |
| 5 | On phone match, open a review dialog. Default decision = "Mark as requote" (preserve existing lead); "Overwrite" available per row, using blank-preserving merge. Every match logged to `lead_requote_events` | Preserves the older lead's data by default while surfacing the requote; lets the user override when needed |

## 4. Architecture

The Ricochet file plugs into the existing paired-batch pipeline as Phase 0, ahead of the existing Daily Call (Phase 1) and Deer Dama (Phase 2) phases. Same `UploadCenter` page, same `importBatch` orchestrator, same `batch_id`, same cascade-rollback on failure.

```
importBatch(ricochetFile, dailyCallFile, deerDamaFile, uploadDate, agencyId)
 ├─ pre-check: hash all 3 files in parallel, early-return on any duplicate
 ├─ Phase 0 — Ricochet
 │    ├─ parse & normalize rows (phone → digits, dates → ISO)
 │    ├─ within-file dedup (last occurrence wins)
 │    ├─ detect phone matches against existing leads (same agency)
 │    ├─ if matches exist → return { status: 'needs_requote_review', matches, pendingBatchId }
 │    ├─ on user confirm → apply per-row decision (requote vs overwrite)
 │    ├─ write: uploads row, raw_ricochet_rows, leads, lead_requote_events
 │    └─ on failure → safeRollback(batchId); abort
 ├─ Phase 1 — Daily Call  (existing; now skips rows whose phone isn't in leads)
 ├─ Phase 2 — Deer Dama   (existing; now skips rows whose phone isn't in leads)
 └─ return BatchResult { ricochet, dailyCall, deerDama }
```

**Two interactive pause points.** Both are pre-write; cancelling either discards everything:
1. File-hash duplicate prompt (existing, extended to 3 files).
2. Requote review dialog (new).

**Rollback invariant.** Every row written across all three phases carries the same `batch_id`. Failure at any point → `deleteBatch(batchId)` cascades through all three uploads' raw rows, derived events, newly-created leads, and `lead_requote_events` in one DELETE.

## 5. Data Model

### 5.1 `leads` — new columns (additive, reuse existing where present)

| Column | Type | Notes |
|---|---|---|
| `first_name` | text | reuse if present |
| `last_name` | text | reuse if present |
| `email` | text | reuse if present |
| `street_address` | text | new if absent |
| `city` | text | new if absent |
| `state` | text(2) | new if absent |
| `zip` | text | text, not int, to preserve leading zeros |
| `campaign` | text | **new** — indexed (segmentation) |
| `lead_date` | date | **new** — per-row from the "Lead Date" column |
| `dwelling_value` | numeric | new |
| `home_value` | numeric | new |
| `lead_cost` | numeric | new — avoid collision with any `cost` column |
| `ricochet_source_upload_id` | uuid → `uploads.id` ON DELETE **SET NULL** | new — provenance; SET NULL (not CASCADE) so deleting a Ricochet upload doesn't wipe leads that have attached events |

Index: `idx_leads_campaign` (btree).

### 5.2 `raw_ricochet_rows` — new table (mirrors `raw_*_rows` pattern)

```
id                 uuid PK
upload_id          uuid → uploads.id ON DELETE CASCADE
batch_id           uuid
agency_id          uuid → agencies.id
row_number         int
phone_raw          text
phone_normalized   text
first_name         text
last_name          text
email              text
street_address     text
city               text
state              text
zip                text
campaign           text
lead_date          date
dwelling_value     numeric
home_value         numeric
lead_cost          numeric
payload            jsonb      -- full original row (incl. dropped columns)
created_at         timestamptz default now()
```

Indexes: `upload_id`, `batch_id`, `phone_normalized`.

### 5.3 `lead_requote_events` — new table

```
id                 uuid PK
lead_id            uuid → leads.id ON DELETE CASCADE
upload_id          uuid → uploads.id ON DELETE CASCADE
batch_id           uuid
agency_id          uuid → agencies.id
raw_row_id         uuid → raw_ricochet_rows.id ON DELETE SET NULL
campaign           text
lead_cost          numeric
lead_date          date
was_overwritten    boolean not null default false
created_at         timestamptz default now()
```

Indexes: `lead_id`, `upload_id`, `batch_id`.

### 5.4 `uploads.report_type`

Extend the enum / check constraint to include `'ricochet_lead_list'` alongside `'daily_call'` and `'deer_dama'`.

### 5.5 Unique constraint on leads (race protection)

`UNIQUE (agency_id, phone_normalized)` on `leads` if one doesn't already exist. This protects both the new Ricochet write path and the existing DC/DD create-on-the-fly path from concurrent-batch races. Constraint violations → `safeRollback` fires.

### 5.6 RLS policies

- `raw_ricochet_rows`: same shape as `raw_daily_call_rows` — admins see all, customers scoped to `agency_id`. No customer DELETE (cascade handles cleanup).
- `lead_requote_events`: admins see all, customers scoped to `agency_id`.
- Existing admin DELETE on `uploads` covers the new type — no new policies there.

### 5.7 Cascade delete semantics

Deleting an `uploads` row where `report_type = 'ricochet_lead_list'` cascades to:
- `raw_ricochet_rows` (CASCADE)
- `lead_requote_events` via `upload_id` (CASCADE)
- Leads the upload created: `ricochet_source_upload_id` → NULL (lead stays; a future cleanup tool can purge "leads with no events and no upload" separately)

Deleting a whole batch (`deleteBatch(batchId)`) cascades to all three uploads and their derived rows and requote events.

## 6. Import Flow

### 6.1 Phase 0 — Ricochet

**Step 0a — parse & normalize.** For each row:
- Phone → strip non-digits, validate 10 or 11 digits. Invalid → `import_errors{reason:'invalid_phone'}`, row skipped.
- Lead Date → ISO (`YYYY-MM-DD`). Unparseable → `import_errors{reason:'invalid_date'}`, row skipped.
- Numeric fields → parsed; blank/unparseable → NULL (not an error).
- Text fields → trimmed.

**Step 0b — within-file dedup.** Duplicate `phone_normalized` within the file: last occurrence wins; earlier occurrences logged to `import_errors{reason:'duplicate_within_file'}`.

**Step 0c — match detection.** `bulkLookupLeadsByPhone(phones, agencyId)`, chunked at 500 (reuse the existing chunking helper). Empty → skip to 0e. Non-empty → return to caller and pause (step 0d).

**Step 0d — requote review (pause).** `importBatch` returns:

```ts
{
  status: 'needs_requote_review',
  matches: Array<{ incoming: RicochetRow, existing: Lead }>,
  pendingBatchId: string,
  parsedState: ParsedBatchState,   // parsed/validated rows for all 3 files; held in UI state during the pause
}
```

No DB writes have happened at this point. UploadCenter stores `parsedState` in React state and opens the dialog; on confirm, calls `resumeBatch(pendingBatchId, decisions, parsedState)`. On cancel, the batch is discarded and `parsedState` is dropped. See 6.4 for why the parsed state is round-tripped rather than held in a server-side store.

**Step 0e — write (all writes share `batch_id`, wrapped by safeRollback):**

1. INSERT `uploads` row — `report_type = 'ricochet_lead_list'`, status `processing`, `batch_id`, `file_hash`.
2. Bulk INSERT `raw_ricochet_rows` — every validated row.
3. Route each row by decision:
   - **No match:** INSERT into `leads` with promoted columns + `ricochet_source_upload_id`.
   - **Match, "Requote"** (default): INSERT `lead_requote_events{was_overwritten:false}`. Leads row untouched.
   - **Match, "Overwrite":** UPDATE `leads` — non-blank fields from Ricochet row overwrite existing values; blanks preserve existing data. Then INSERT `lead_requote_events{was_overwritten:true}`.
4. UPDATE `uploads.status` → `complete` (or `complete_with_errors` if any `import_errors` rows).

Any failure → `safeRollback(batchId)` → cascade delete → throw `BatchRollbackError`.

### 6.2 Phase 1 — Daily Call

Structurally unchanged. Two additions:
- Before inserting call events, each row's phone is looked up in `leads`. Phones not found → row skipped, logged to `import_errors{reason:'phone_not_in_leads'}`.
- Summary includes a new counter `rowsSkippedUnmatched`.

### 6.3 Phase 2 — Deer Dama

Same two additions as Phase 1. No other changes.

### 6.4 Pause semantics for the requote dialog

The pause between Phase 0's match detection and Phase 0's write is purely in-memory. `importBatch` (which runs in the browser against Supabase) returns `needs_requote_review` without writing; the parsed rows for all three files are returned to the caller as `parsedState`. UploadCenter holds `parsedState` in React state while the dialog is open. When the user confirms, `resumeBatch(pendingBatchId, decisions, parsedState)` is called — the continuation receives the same parsed state, applies the decisions, and proceeds to Phase 0 write.

No DB rows exist during the pause. Nothing to clean up if the user walks away.

Trade-off: if the browser tab closes during the pause, the parsed state is lost and the user must re-drop the files. That's intentional — the batch stays truly transactional, with no half-state to reconcile on reload.

### 6.5 BatchResult (extended)

```ts
{
  batchId: string,
  ricochet: {
    rowsImported: number,      // new leads created
    rowsUpdated: number,       // existing leads overwritten
    requotesLogged: number,    // total entries in lead_requote_events
    errors: ImportError[]
  },
  dailyCall: {
    rowsImported: number,
    rowsSkippedUnmatched: number,
    errors: ImportError[]
  },
  deerDama: {
    rowsImported: number,
    rowsSkippedUnmatched: number,
    errors: ImportError[]
  },
  rolledBack: false
}
```

### 6.6 Failure matrix

| Failure point | Result |
|---|---|
| Any file is a hash duplicate | Early return, duplicate prompt (force-all-3 or cancel) |
| Invalid rows in any file | Logged, skipped; batch continues |
| Ricochet write fails mid-phase | `safeRollback(batch_id)` — nothing persists |
| User cancels requote dialog | Nothing written; batch discarded |
| Phase 1 or Phase 2 write fails | `safeRollback(batch_id)` — cascade deletes Phase 0 writes too |
| `deleteBatch` itself fails during rollback | `BatchRollbackError` surfaces; user warned of possible partial state; admin can delete by batch |

## 7. UI

### 7.1 Layout — UploadCenter select step

Three stacked drop zones. DC and DD slots are visibly locked (grey background, lock icon, helper text "Upload the Ricochet Lead List first") until `batchState.ricochet` is populated.

```
┌─────────────────────────────────────────────────┐
│  Upload Date: [ 2026-04-22 ▼ ]                  │
├─────────────────────────────────────────────────┤
│  1. Ricochet Lead List      (required first)    │
│  [drop zone]                                    │
├─────────────────────────────────────────────────┤
│  2. Daily Call Report             [LOCKED 🔒]   │
│  [drop zone — disabled until Ricochet]          │
├─────────────────────────────────────────────────┤
│  3. Deer Damage (Lead) Report     [LOCKED 🔒]   │
│  [drop zone — disabled until Ricochet]          │
├─────────────────────────────────────────────────┤
│              [ Continue ] (disabled until all 3)│
└─────────────────────────────────────────────────┘
```

### 7.2 BatchDropSlot (reused, extended)

- New `expectedType` value: `REPORT_TYPES.RICOCHET_LEAD_LIST`.
- `detectReportType` extended to score against a new `RICOCHET_COLUMNS` constant (distinctive columns: `Dwelling Value`, `Home Value`, `Campaign`, `Lead Date`, `Building Sqft`). Threshold ≥5, must out-score both DAILY_CALL and DEER_DAMA.
- New `disabled` prop. When true, renders the locked state.

### 7.3 BatchState shape (extended)

```ts
{
  step: 'select' | 'preview' | 'requote_review' | 'importing' | 'summary',
  ricochet: BatchDropSlotValue | null,
  dailyCall: BatchDropSlotValue | null,
  deerDama: BatchDropSlotValue | null,
  uploadDate: string | null,
  requoteMatches: RequoteMatch[] | null,
  requoteDecisions: Record<string, 'requote' | 'overwrite'> | null,
  progress: BatchProgress | null,
  result: BatchResult | null,
  rollbackMessage: string | null,
}
```

New step `'requote_review'`; entered when Phase 0 returns `needs_requote_review`, exits to `'importing'` on confirm, back to `'preview'` on cancel.

### 7.4 RequoteReviewDialog (new component)

Shadcn `Dialog`, matches existing dialog style.

- **Header:** "Phone Matches Found — Review Before Import."
- **Summary:** "{N} incoming leads match existing leads by phone. Choose how to handle each, or use bulk actions below."
- **Bulk buttons:** `[Mark all as requote]` · `[Overwrite all]`.
- **Scrollable list** of match cards. Each card shows phone, decision selector (default `Requote`), and side-by-side existing vs. incoming data. When `Overwrite` is selected on a card, fields that would be wiped by a blank incoming value are highlighted amber — visual confirmation that the blank-preserves rule is in effect.
- **Footer:** `[Cancel Import]` (destructive) · `[Confirm & Import]` (primary).

### 7.5 Preview step

Extended to show all three files' first-5-row previews side-by-side (or stacked on narrow screens), with detected type + row count.

### 7.6 Summary step

```
Ricochet Lead List
  ✓ 47 new leads created
  ✓ 3 leads updated (overwritten)
  🔄 12 requotes logged
  ⚠ 2 rows skipped (invalid phone)

Daily Call Report
  ✓ 312 call events imported
  ⚠ 8 rows skipped (phone not in leads)

Deer Damage Report
  ✓ 89 lead records imported
  ⚠ 1 row skipped (phone not in leads)
```

Each "⚠ N rows skipped" line is clickable → opens a modal listing row number + phone + reason. Modal supports CSV export via the existing export pattern.

### 7.7 Upload history

Client-side `batch_id` grouping in `useUploadHistory` handles three uploads per batch automatically — no code change. Admin delete-by-batch deletes all three.

### 7.8 Cancel semantics

At any interactive pause — duplicate prompt, requote review, or preview → Continue — "Cancel" discards everything and resets state to `'select'` with files cleared.

## 8. Validation, Error Handling, Edge Cases

### 8.1 Row-level validation

| Check | Action on failure |
|---|---|
| Phone present, 10 or 11 digits after normalization | Skip, `import_errors{reason:'invalid_phone'}` |
| Dates parse | Skip, `import_errors{reason:'invalid_date'}` |
| Required columns on file | File rejected at drop slot (before import) |
| Duplicate phone within same file | Skip earlier occurrences, `import_errors{reason:'duplicate_within_file'}`, last wins |
| Numeric fields unparseable | Store NULL — not an error |

### 8.2 File-level (drop slot, client-side)

- Column detection ≥5 for expected type. Wrong-type files show a warning but don't block Continue (existing behavior). Unknown-type files block.
- File too large → reject.
- Empty file (no rows after header) → reject.

### 8.3 Batch-level preconditions

- `agencyId` set.
- All three slots populated and `typeMatches === true`.
- Upload date set.

### 8.4 Duplicate-file detection

Extended to 3 files, hashed in parallel. Any existing hash for this agency → duplicate prompt listing which files are dupes, offering `[Force Import All 3]` / `[Cancel]`. On force: each file's `file_hash` written as NULL (existing convention). Partial force (re-importing only one of three) is not supported — all-or-nothing.

### 8.5 Concurrency

- Each batch has a client-generated `batch_id` (UUID). No collision possible.
- Sequential batches for the same agency/day: second batch's match detection will correctly find leads the first created and offer them as requotes.
- Concurrent Phase 0s for the same phone: `UNIQUE (agency_id, phone_normalized)` on `leads` (see 5.5) causes the losing batch to fail → `safeRollback` → clean cleanup.

### 8.6 Requote-flow edge cases

| Case | Behavior |
|---|---|
| Ricochet row matches a lead created earlier in the **same** Ricochet file | Within-file dedup (6.1 step 0b) handles before match detection. |
| Match found but incoming row is identical to existing | Dialog opens; default "Requote" logs event but doesn't modify lead. Informational. |
| Match detection returns 0 rows | Dialog skipped entirely. |
| User picks "Overwrite" on a row whose incoming values are all blank | Nothing changes on the lead (blank-preserves rule); `was_overwritten = true` still logged. Mitigation: amber highlight in dialog shows what would actually change. |
| Lead previously overwritten, then another Ricochet row matches | New requote event added. History is additive. |

### 8.7 Observability

- Every upload still has its `status` lifecycle (`processing` → `complete` / `complete_with_errors`).
- `BatchRollbackError` carries context for all three phases — phase name, original error, whether rollback itself succeeded.

### 8.8 Agency scoping

All new tables have `agency_id` columns. Match detection is scoped to the current agency. RLS policies mirror the existing `raw_*_rows` shape.
