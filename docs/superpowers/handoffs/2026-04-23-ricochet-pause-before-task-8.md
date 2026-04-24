# Ricochet Lead List — End-of-Day Handoff (2026-04-23)

**Branch:** `fix-daily-call-lookup-chunking`
**Plan:** `docs/superpowers/plans/2026-04-23-ricochet-report.md`
**Spec:** `docs/superpowers/specs/2026-04-23-ricochet-report-design.md`

## Quick resume

To pick up tomorrow, run `/resume` (or equivalent) and tell Claude:

> Resume the Ricochet Lead List implementation. Tasks 1–7d are done; next is Task 8 (RequoteReviewDialog). See `docs/superpowers/handoffs/2026-04-23-ricochet-pause-before-task-8.md` for state. Continue subagent-driven execution.

The remaining code changes are Tasks 8, 9a–d. Task 10 is manual browser testing. **Before Task 10, fix the 4 TypeScript errors listed below.**

## What landed today (commits on `fix-daily-call-lookup-chunking`)

| SHA | Task | Summary |
|---|---|---|
| `ce94c2a` | pre-work | Design spec |
| `0f5b611` | pre-work | Implementation plan |
| `d8f09a3` | Task 1 | Migration SQL (applied via Lovable) |
| `e4ffe76` | pre-work | Plan corrections (`normalized_phone`, preserve existing REPORT_TYPES values) |
| `ed0567b` | Task 2 | Merge main — Lovable-regenerated Supabase types |
| `3bd78b8` | Task 3 | `RICOCHET_COLUMNS` + `REPORT_TYPES.RICOCHET_LEAD_LIST` + tests (3 passing) |
| `ea1c278` | Task 4 | `BatchDropSlot`: 3-way detection + `disabled` prop |
| `6a2c876` | Task 5 | `ricochetParser.ts` pure functions + tests (17 passing) |
| `a82dfde` | Task 6 | `importRicochet.ts` — parse, match, write (Phase 0) |
| `be012f4` | Task 6 fix | Drop unused `existing` param + redundant SELECT in overwrite path |
| `1b8fada` | Task 7a | `importService.ts` types: `ImportBatchResult`, `ParsedBatchState`, `ricochet?` on `BatchResult`, `rowsSkippedUnmatched?` on `ImportResult` |
| `96521b4` | Task 7b | `importDailyCallReport` skips rows whose phone is not in `leads`, writes to `import_errors`, returns `rowsSkippedUnmatched` |
| `e60841a` | Task 7c | `importDeerDamaReport` same skip pattern; `UnmatchedError` lifted to module scope |
| `a503ed3` | Task 7d | `importBatch` extended to 3 phases with Ricochet requote pause; `finalizeBatch` helper + `resumeBatch` exported |

## What's remaining

| Task | Scope | Status |
|---|---|---|
| **Task 8** | Build `RequoteReviewDialog` component | Pending |
| **Task 9a** | Extend `BatchState` in `UploadCenter.tsx` | Pending |
| **Task 9b** | 3-slot layout with locking | Pending |
| **Task 9c** | Wire `importBatch` / `resumeBatch` + dialog into `UploadCenter` (fixes 4 TS errors) | Pending |
| **Task 9d** | 3-block summary + skipped-rows modal with CSV export | Pending |
| **Task 10** | Browser verification | Pending (manual) |

## TypeScript errors to fix before Task 10

Running `npx tsc --noEmit -p tsconfig.app.json` currently reports **8 errors** across 3 files. Classify them:

### Fix these before merge (unrelated to remaining tasks — leftover from Task 6)

These are strict-config errors that slipped past Task 6's typecheck (which used the looser base tsconfig). Address them as a small cleanup commit before Task 10:

1. **`src/lib/importRicochet.ts:53`** — `Property 'error' does not exist on type 'ParseResult<RicochetRow>'` when `ok: true`. TypeScript narrowing issue in the error-accumulation code path in `parseRicochetFile`. The fix is to properly narrow on `result.ok === false` before accessing `result.error`.

2. **`src/lib/importRicochet.ts:173`** — The bulk insert of `raw_ricochet_rows` fails because `payload: Record<string, unknown>` doesn't satisfy Supabase's `Json` type. The fix is either a cast (`payload: r.payload as Json`) or to type `payload` as `Json` in `RicochetRow`.

3. **`src/lib/ricochetParser.test.ts:100`, `:106`** — Same narrowing issue as #1, in two test cases that access `parsed.error.reason` after an `ok === false` branch. The test file type-guards correctly at lines 100 and 106 (`if (!parsed.ok)`) — but TS's control-flow analysis with the conditional inside `it()` block may not be flowing through properly. Probably one of:
   - The `if (!parsed.ok)` was removed during edits
   - TS needs a local const binding of the result to preserve narrowing through the inner expect

Read the actual lines tomorrow and fix concretely.

### Will be fixed by Task 9c (expected, not real issues)

4. **`src/pages/UploadCenter.tsx:87`** — old positional call to `importBatch` (now takes an options object).
5. **`src/pages/UploadCenter.tsx:95`, `:96`** — accesses `.duplicateOf` on `ImportBatchResult`, but the new discriminated union puts it under `status: 'duplicate'` variant.
6. **`src/pages/UploadCenter.tsx:106`** — state type mismatch: `BatchResult` vs `ImportBatchResult`.

These four are exactly what Task 9c will rewrite, so don't pre-fix them.

## Open design issues flagged but not yet addressed

### 1. Overwrite-rollback gap (flagged by Task 7d implementer)

If a user chooses "Overwrite" during requote review and `writeRicochetPhase` UPDATEs an existing lead's fields, and then Phase 1 or Phase 2 subsequently fails, `safeRollback(batchId)` → `deleteBatch(batchId)` will cascade-delete the Ricochet `uploads` row, the `raw_ricochet_rows`, the `lead_requote_events`, and any newly-inserted `leads`. But it will **NOT** revert the in-place UPDATE to a pre-existing lead's fields. The lead stays overwritten without any trace of the upload that did it.

**Potential fixes to discuss tomorrow:**
- **A.** Capture pre-UPDATE snapshots in `lead_requote_events` (add a `previous_values jsonb` column), so rollback can restore. Changes the schema.
- **B.** Defer the overwrite UPDATE until after Phases 1 and 2 succeed (run it in a "commit" step at the end of `finalizeBatch`). Keeps Phase 0 read-mostly except for new-lead inserts.
- **C.** Accept the risk — overwrites are user-initiated and rare; if Phase 1/2 fails the user notices and can manually reconcile. Document the limitation.

My recommendation is **B** — it preserves correctness without schema changes and keeps the atomic-batch invariant intact. Flag for user decision tomorrow before implementing.

### 2. `importDailyCallReport`'s "Insert new leads" branch is now dead code

After Task 7b's pre-filter, `matchedRows` by definition only contains phones that already exist in `leads`. The Phase 3 "create new leads" branch in `importDailyCallReport` can never fire. Task 7b's implementer left it in as a safety net. Worth a small cleanup commit to remove it — but not blocking Task 8.

### 3. `importDeerDamaReport`'s `lead_id_external` recovery path was closed

The existing DD importer had a fallback where rows with no phone match could still be attached to a lead via `lead_id_external`. After Task 7c's pre-filter, that path is closed — phone is the sole join key. This is correct per the Ricochet-authoritative design but worth confirming with the user before shipping.

## State of working tree

- No uncommitted changes on tracked files.
- Untracked: `.claude/`, `LeadListExample.csv`, `supabase/.temp/` — ignore.
- Tests: `npm test` — `ricochetParser.test.ts` 17/17, `constants.test.ts` 3/3 passing as of end-of-day. One Task-6 test file (`ricochetParser.test.ts`) has 2 TS errors (items #3 above) that may or may not prevent vitest running — check tomorrow.
- Branch is **11 commits ahead** of `origin/main`.
- Branch is **not pushed** to remote yet.

## Migration status

Migration `supabase/migrations/20260423150000_add_ricochet_report.sql` was pasted into Lovable and applied successfully. Lovable regenerated `src/integrations/supabase/types.ts` on `main` (commits `4d84498` and earlier), which was merged into this branch at `ed0567b`. No further migration work needed.

## Recommended order tomorrow

1. **Fix the 4 non-UploadCenter TypeScript errors** (importRicochet.ts + ricochetParser.test.ts) — small dedicated commit. ~10 min.
2. **Discuss the overwrite-rollback gap** with the user and pick A/B/C. If B, add a small follow-up task to defer overwrite UPDATEs.
3. **Task 8:** `RequoteReviewDialog`. No dependencies on Tasks 9 — can be built standalone.
4. **Tasks 9a–d:** `UploadCenter` integration. Each sub-task is small. Task 9c removes the 4 expected TS errors.
5. **Task 10:** hand off to user for manual browser testing (`npm run dev`).

## Resources

- Design spec: `docs/superpowers/specs/2026-04-23-ricochet-report-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-23-ricochet-report.md`
- Example Ricochet CSV: `LeadListExample.csv` (project root, untracked)
- Existing UploadCenter for reference: `src/pages/UploadCenter.tsx` (needs Task 9 rewrite)
