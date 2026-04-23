# Ricochet Lead List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third report (Ricochet Lead List) to the paired batch upload flow as the authoritative seed of truth for leads, with a requote review dialog for phone matches and atomic rollback across all three phases.

**Architecture:** Extends the existing paired-batch pipeline (UploadCenter → importBatch → importDailyCallReport/importDeerDamaReport, keyed on `batch_id` with cascade rollback) from 2 files → 3 files. Adds Phase 0 (Ricochet) ahead of the existing phases; Ricochet runs match detection and pauses for a requote review dialog before writing; Phase 1/2 skip rows whose phone isn't in `leads`.

**Tech Stack:** Vite + React 18 + TypeScript, Supabase, shadcn/ui, @tanstack/react-query, Vitest (pure-function tests), xlsx (file parsing), date-fns, Playwright (manual browser verification).

---

## Reference — Existing Code Locations

| Thing | Path | Line |
|---|---|---|
| `REPORT_TYPES`, `DAILY_CALL_COLUMNS`, `DEER_DAMA_COLUMNS` | `src/lib/constants.ts` | 108, 114, 121 |
| `bulkLookupLeadsByPhone` | `src/lib/importService.ts` | 280 |
| `importDailyCallReport` | `src/lib/importService.ts` | 336 |
| `importDeerDamaReport` | `src/lib/importService.ts` | 804 |
| `importBatch` | `src/lib/importService.ts` | 1250 |
| `safeRollback` | `src/lib/importService.ts` | 1347 |
| `deleteUpload`, `deleteBatch` | `src/lib/importService.ts` | 1376, 1385 |
| `BatchProgress`, `BatchResult` types | `src/lib/importService.ts` | 54, 62 |
| `BatchState` interface (inline) | `src/pages/UploadCenter.tsx` | 30 |
| `BatchDropSlot` | `src/components/upload/BatchDropSlot.tsx` | — |
| Supabase generated types | `src/integrations/supabase/types.ts` | — |
| Migrations dir | `supabase/migrations/*.sql` | — |

**Migration sync pattern.** Per project convention: SQL files are committed here, then pasted into Lovable's migration editor so Lovable applies them and regenerates `src/integrations/supabase/types.ts`. Do **not** run `supabase db push` or use the Supabase dashboard directly. The migration file we commit is the authoritative source; Lovable just executes it.

**Testing convention.** The repo has Vitest configured (`npm test`) but minimal coverage — only `src/test/example.test.ts`. Pure utility functions (parsers, normalizers, detection) will get unit tests; DB write paths and UI components will be verified by browser testing at the end. This matches existing patterns in the repo.

---

## File Structure

**Files to create:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/<timestamp>_add_ricochet_report.sql` | All schema changes in one migration: new columns on `leads`, `raw_ricochet_rows` table, `lead_requote_events` table, `report_type` enum extension, unique constraint on leads, RLS policies, cascade FKs |
| `src/lib/ricochetParser.ts` | Pure functions: parse Ricochet row → typed object, phone normalization, date parsing, numeric parsing, within-file dedup |
| `src/lib/ricochetParser.test.ts` | Unit tests for the parser |
| `src/lib/importRicochet.ts` | Phase 0 importer: orchestrates parse → match detection → write; exports `parseRicochetFile`, `detectMatches`, `writeRicochetPhase` |
| `src/components/upload/RequoteReviewDialog.tsx` | Review dialog: match list, per-row/bulk decisions, side-by-side existing vs. incoming display |

**Files to modify:**

| Path | Changes |
|---|---|
| `src/lib/constants.ts` | Add `REPORT_TYPES.RICOCHET_LEAD_LIST`, add `RICOCHET_COLUMNS` constant |
| `src/lib/constants.test.ts` (create if absent) | Test `RICOCHET_COLUMNS` detection scoring |
| `src/components/upload/BatchDropSlot.tsx` | Add `disabled` prop (locked state rendering), extend `detectReportType` to score against `RICOCHET_COLUMNS` |
| `src/lib/importService.ts` | Add new types (`RicochetRow`, `RequoteMatch`, `ParsedBatchState`, `RicochetDecision`, `RequoteReviewResult`); extend `BatchResult` with `ricochet` block; extend `importBatch` to 3 phases with requote pause; add `resumeBatch`; add `phone_not_in_leads` skip logic to Phase 1/2 |
| `src/pages/UploadCenter.tsx` | Extend `BatchState` with `ricochet`, `requoteMatches`, `requoteDecisions`, `parsedState`; add `requote_review` step; render 3-slot layout with locked slots; wire RequoteReviewDialog; render 3-block summary |

---

## Task Order & Dependencies

1. Migration + types regeneration — foundation for everything else.
2. Constants + RICOCHET_COLUMNS detection — needed before BatchDropSlot update.
3. Pure parser + tests — standalone, can run in parallel with UI work.
4. BatchDropSlot extension — depends on constants.
5. importRicochet module — depends on parser, constants, types.
6. importService.ts changes — depends on importRicochet; adds `resumeBatch` and Phase 1/2 skips.
7. RequoteReviewDialog — depends on types only, can be built early.
8. UploadCenter integration — depends on everything above.
9. Browser verification — last step.

---

## Task 1: Create the migration SQL

**Files:**
- Create: `supabase/migrations/20260423150000_add_ricochet_report.sql`

**Note on timestamp:** Use the current date-time in the format `YYYYMMDDHHMMSS`. The filename shown above assumes 2026-04-23 15:00:00; adjust if later.

**Note on `leads` columns:** Some columns (`first_name`, `last_name`, `email`) may already exist. The migration uses `ADD COLUMN IF NOT EXISTS` for all `leads` additions. `report_type` enum mechanism (native ENUM vs CHECK constraint) must be verified against the most recent migration that touches `uploads.report_type` — inspect `supabase/migrations/20260423120000_uploads_delete_and_batching.sql` and earlier.

- [ ] **Step 1: Inspect current `uploads.report_type` mechanism**

Read the most recent migration that added `deer_dama` or modified `report_type`. Find whether it's a Postgres `CREATE TYPE ... AS ENUM` or a `CHECK (report_type IN (...))` constraint.

Run:
```bash
grep -n "report_type" supabase/migrations/*.sql
```

Record which mechanism is used. The SQL in Step 2 must match.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/20260423150000_add_ricochet_report.sql` with this content. Replace the placeholder enum-extension block in one of the two variants depending on what Step 1 found:

```sql
-- Ricochet Lead List — third report type in paired batch upload

BEGIN;

-- =========================================================
-- 1. leads: new columns (additive, IF NOT EXISTS)
-- =========================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_name        text,
  ADD COLUMN IF NOT EXISTS last_name         text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS street_address    text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS state             text,
  ADD COLUMN IF NOT EXISTS zip               text,
  ADD COLUMN IF NOT EXISTS campaign          text,
  ADD COLUMN IF NOT EXISTS lead_date         date,
  ADD COLUMN IF NOT EXISTS dwelling_value    numeric,
  ADD COLUMN IF NOT EXISTS home_value        numeric,
  ADD COLUMN IF NOT EXISTS lead_cost         numeric,
  ADD COLUMN IF NOT EXISTS ricochet_source_upload_id uuid;

-- FK with ON DELETE SET NULL so deleting a Ricochet upload
-- doesn't wipe leads that have attached events.
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_ricochet_source_upload_id_fkey;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_ricochet_source_upload_id_fkey
  FOREIGN KEY (ricochet_source_upload_id)
  REFERENCES public.uploads(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.leads (campaign);

-- Unique constraint for race protection (see spec §5.5).
-- If one already exists with a different name, skip this block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(agency_id, phone_normalized)%'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_agency_phone_unique
      UNIQUE (agency_id, phone_normalized);
  END IF;
END $$;

-- =========================================================
-- 2. raw_ricochet_rows (mirrors raw_*_rows pattern)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.raw_ricochet_rows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id          uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  batch_id           uuid,
  agency_id          uuid NOT NULL REFERENCES public.agencies(id),
  row_number         int,
  phone_raw          text,
  phone_normalized   text,
  first_name         text,
  last_name          text,
  email              text,
  street_address     text,
  city               text,
  state              text,
  zip                text,
  campaign           text,
  lead_date          date,
  dwelling_value     numeric,
  home_value         numeric,
  lead_cost          numeric,
  payload            jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_ricochet_rows_upload_id
  ON public.raw_ricochet_rows (upload_id);
CREATE INDEX IF NOT EXISTS idx_raw_ricochet_rows_batch_id
  ON public.raw_ricochet_rows (batch_id);
CREATE INDEX IF NOT EXISTS idx_raw_ricochet_rows_phone_normalized
  ON public.raw_ricochet_rows (phone_normalized);

ALTER TABLE public.raw_ricochet_rows ENABLE ROW LEVEL SECURITY;

-- RLS: admins see all; customers scoped to their agency.
-- Policy names mirror the raw_daily_call_rows convention.
CREATE POLICY raw_ricochet_rows_select_admin
  ON public.raw_ricochet_rows FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY raw_ricochet_rows_select_customer
  ON public.raw_ricochet_rows FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM public.user_agency_memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY raw_ricochet_rows_insert_admin
  ON public.raw_ricochet_rows FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY raw_ricochet_rows_insert_customer
  ON public.raw_ricochet_rows FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM public.user_agency_memberships
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================
-- 3. lead_requote_events
-- =========================================================
CREATE TABLE IF NOT EXISTS public.lead_requote_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  upload_id          uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  batch_id           uuid,
  agency_id          uuid NOT NULL REFERENCES public.agencies(id),
  raw_row_id         uuid REFERENCES public.raw_ricochet_rows(id) ON DELETE SET NULL,
  campaign           text,
  lead_cost          numeric,
  lead_date          date,
  was_overwritten    boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_requote_events_lead_id
  ON public.lead_requote_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_requote_events_upload_id
  ON public.lead_requote_events (upload_id);
CREATE INDEX IF NOT EXISTS idx_lead_requote_events_batch_id
  ON public.lead_requote_events (batch_id);

ALTER TABLE public.lead_requote_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_requote_events_select_admin
  ON public.lead_requote_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY lead_requote_events_select_customer
  ON public.lead_requote_events FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM public.user_agency_memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY lead_requote_events_insert_admin
  ON public.lead_requote_events FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY lead_requote_events_insert_customer
  ON public.lead_requote_events FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM public.user_agency_memberships
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================
-- 4. uploads.report_type — add 'ricochet_lead_list'
-- =========================================================
-- VARIANT A (native ENUM): use ALTER TYPE ... ADD VALUE.
-- VARIANT B (CHECK constraint): DROP old check, ADD new check.
-- Uncomment the block that matches the existing schema from Step 1.

-- ---- VARIANT A ----
-- ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'ricochet_lead_list';

-- ---- VARIANT B ----
-- ALTER TABLE public.uploads DROP CONSTRAINT IF EXISTS uploads_report_type_check;
-- ALTER TABLE public.uploads
--   ADD CONSTRAINT uploads_report_type_check
--   CHECK (report_type IN ('daily_call', 'deer_dama', 'ricochet_lead_list'));

COMMIT;
```

- [ ] **Step 3: Uncomment the correct variant for `report_type`**

Based on Step 1's finding, uncomment VARIANT A or B in the SQL file. Delete the other variant block and its comment headers.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260423150000_add_ricochet_report.sql
git commit -m "Add migration for Ricochet Lead List report"
```

- [ ] **Step 5: Apply via Lovable (manual step by the user)**

Tell the user: *"Migration file committed. Paste its contents into Lovable's SQL editor to apply, and Lovable will regenerate `src/integrations/supabase/types.ts`. Confirm when types have been updated."*

Do not proceed to Task 2 until the user confirms the migration ran and types were regenerated.

---

## Task 2: Pull the regenerated Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated by Lovable; do not edit manually)

- [ ] **Step 1: Verify types include the new tables**

Run:
```bash
grep -n "raw_ricochet_rows\|lead_requote_events\|ricochet_lead_list" src/integrations/supabase/types.ts
```

Expected: matches for all three names. If any are missing, Lovable didn't regenerate — ask the user to trigger regeneration.

- [ ] **Step 2: Commit the regenerated types**

```bash
git add src/integrations/supabase/types.ts
git commit -m "Regenerate Supabase types for Ricochet tables"
```

---

## Task 3: Add constants for Ricochet report type and columns

**Files:**
- Modify: `src/lib/constants.ts` (near line 108–130)
- Create: `src/lib/constants.test.ts`

- [ ] **Step 1: Read the current constants**

Read `src/lib/constants.ts` lines 100–140 to see the exact shape of `REPORT_TYPES`, `DAILY_CALL_COLUMNS`, `DEER_DAMA_COLUMNS`. Match that shape.

- [ ] **Step 2: Write the failing test for RICOCHET_COLUMNS**

Create `src/lib/constants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RICOCHET_COLUMNS, REPORT_TYPES } from './constants';

describe('RICOCHET_COLUMNS', () => {
  it('exposes the ricochet lead list report type', () => {
    expect(REPORT_TYPES.RICOCHET_LEAD_LIST).toBe('ricochet_lead_list');
  });

  it('includes the distinctive Ricochet columns', () => {
    expect(RICOCHET_COLUMNS).toEqual(
      expect.arrayContaining([
        'first name',
        'last name',
        'phone',
        'email',
        'campaign',
        'lead date',
        'dwelling value',
        'home value',
        'cost',
        'building sqft',
      ])
    );
  });

  it('entries are lowercased (matches detectReportType case-insensitive scoring)', () => {
    for (const c of RICOCHET_COLUMNS) {
      expect(c).toBe(c.toLowerCase());
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- src/lib/constants.test.ts
```

Expected: FAIL — `RICOCHET_COLUMNS` is not exported, `REPORT_TYPES.RICOCHET_LEAD_LIST` is undefined.

- [ ] **Step 4: Add RICOCHET_LEAD_LIST and RICOCHET_COLUMNS**

Edit `src/lib/constants.ts`:

Add the new report type to `REPORT_TYPES`:
```ts
export const REPORT_TYPES = {
  DAILY_CALL: 'daily_call',
  DEER_DAMA: 'deer_dama',
  RICOCHET_LEAD_LIST: 'ricochet_lead_list',
} as const;
```

Add `RICOCHET_COLUMNS` immediately after `DEER_DAMA_COLUMNS`:
```ts
export const RICOCHET_COLUMNS = [
  'first name',
  'last name',
  'street address',
  'city',
  'state',
  'zip',
  'phone',
  'email',
  'campaign',
  'lead date',
  'dwelling value',
  'home value',
  'cost',
  'bedrooms',
  'total bathrooms',
  'building sqft',
  'effective year built',
  'number of stories',
] as const;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/lib/constants.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts src/lib/constants.test.ts
git commit -m "Add Ricochet report type and column constants"
```

---

## Task 4: Extend BatchDropSlot — detection + disabled state

**Files:**
- Modify: `src/components/upload/BatchDropSlot.tsx`

- [ ] **Step 1: Read the current detectReportType function**

Run:
```bash
grep -n "detectReportType\|DAILY_CALL_COLUMNS\|DEER_DAMA_COLUMNS\|expectedType\|disabled" src/components/upload/BatchDropSlot.tsx
```

Record the existing shape. The extension must keep the same scoring behavior (case-insensitive intersection, threshold ≥5) but add a third type.

- [ ] **Step 2: Update imports at top of BatchDropSlot.tsx**

Add `RICOCHET_COLUMNS` to the existing constants import:
```ts
import {
  DAILY_CALL_COLUMNS,
  DEER_DAMA_COLUMNS,
  RICOCHET_COLUMNS,
  REPORT_TYPES,
} from '@/lib/constants';
```

- [ ] **Step 3: Extend detectReportType to score against 3 types**

Locate `detectReportType` in `BatchDropSlot.tsx`. Replace the scoring block with this:

```ts
function detectReportType(columns: string[]): string {
  const lowered = columns.map((c) => c.toLowerCase());
  const dailyMatch = lowered.filter((c) => DAILY_CALL_COLUMNS.includes(c)).length;
  const deerMatch  = lowered.filter((c) => DEER_DAMA_COLUMNS.includes(c)).length;
  const ricoMatch  = lowered.filter((c) => RICOCHET_COLUMNS.includes(c)).length;

  // Pick the highest-scoring type that also meets the ≥5 threshold.
  // Ties: Ricochet > Deer Dama > Daily Call (Ricochet has the most unique columns).
  const scores: Array<[number, string]> = [
    [ricoMatch, REPORT_TYPES.RICOCHET_LEAD_LIST],
    [deerMatch, REPORT_TYPES.DEER_DAMA],
    [dailyMatch, REPORT_TYPES.DAILY_CALL],
  ];
  const [topScore, topType] = scores.reduce((best, cur) =>
    cur[0] > best[0] ? cur : best
  );
  return topScore >= 5 ? topType : '';
}
```

- [ ] **Step 4: Add `disabled` prop to the component**

Find the props interface for `BatchDropSlot`. Add:

```ts
export interface BatchDropSlotProps {
  // ... existing props
  disabled?: boolean;
  disabledHelperText?: string;
}
```

Thread `disabled` through the component: when `disabled === true`, render the locked state.

Locked state rendering (inside the drop zone when `value === null && disabled === true`):

```tsx
{value === null && disabled ? (
  <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted bg-muted/30 p-8 text-center opacity-60">
    <Lock className="h-6 w-6 text-muted-foreground mb-2" aria-hidden />
    <p className="text-sm text-muted-foreground">
      {disabledHelperText ?? 'Upload the previous step first.'}
    </p>
  </div>
) : /* existing empty-state rendering */}
```

Import `Lock` from `lucide-react` at the top.

Also: when `disabled`, the drop-zone's input must not accept files. Guard the drag/drop and file-input handlers:

```ts
const onDrop = useCallback((e: React.DragEvent) => {
  if (disabled) return;
  // ... existing logic
}, [disabled, /* other deps */]);

const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (disabled) return;
  // ... existing logic
};
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/upload/BatchDropSlot.tsx
git commit -m "Extend BatchDropSlot for Ricochet type detection and locked state"
```

---

## Task 5: Build the Ricochet parser (pure functions + tests)

**Files:**
- Create: `src/lib/ricochetParser.ts`
- Create: `src/lib/ricochetParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ricochetParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  parseLeadDate,
  parseNumeric,
  parseRicochetRow,
  dedupeRicochetRowsByPhone,
} from './ricochetParser';

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('205-206-3492')).toBe('2052063492');
    expect(normalizePhone('(205) 206.3492')).toBe('2052063492');
  });
  it('accepts 10-digit phones', () => {
    expect(normalizePhone('2052063492')).toBe('2052063492');
  });
  it('accepts 11-digit phones starting with 1', () => {
    expect(normalizePhone('12052063492')).toBe('12052063492');
  });
  it('returns null for too-short phones', () => {
    expect(normalizePhone('205206')).toBeNull();
  });
  it('returns null for blank/undefined', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('parseLeadDate', () => {
  it('parses M/D/YYYY', () => {
    expect(parseLeadDate('4/22/2026')).toBe('2026-04-22');
  });
  it('parses MM/DD/YYYY', () => {
    expect(parseLeadDate('04/22/2026')).toBe('2026-04-22');
  });
  it('parses YYYY-MM-DD', () => {
    expect(parseLeadDate('2026-04-22')).toBe('2026-04-22');
  });
  it('returns null on unparseable', () => {
    expect(parseLeadDate('not a date')).toBeNull();
    expect(parseLeadDate('')).toBeNull();
  });
});

describe('parseNumeric', () => {
  it('parses plain numbers', () => {
    expect(parseNumeric('217500')).toBe(217500);
    expect(parseNumeric('0.01')).toBe(0.01);
  });
  it('strips dollar signs and commas', () => {
    expect(parseNumeric('$217,500')).toBe(217500);
    expect(parseNumeric('$1,234.56')).toBe(1234.56);
  });
  it('returns null on blank/unparseable', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('n/a')).toBeNull();
  });
});

describe('parseRicochetRow', () => {
  const row = {
    'First Name': 'Ordrey',
    'Last Name': 'Sanders',
    'Street Address': '225 Kensington Ln',
    'City': 'Alabaster',
    'State': 'AL',
    'Zip': '35007',
    'Phone': '205-206-3492',
    'Email': 'asanders9840@gmail.com',
    'Campaign': '2009 Older Homes',
    'Lead Date': '4/22/2026',
    'Dwelling Value': '217500',
    'Home Value': '217500',
    'Cost': '0.01',
    'Bedrooms': '',
    'Total Bathrooms': '2.5',
    'Building Sqft': '2463',
    'Effective Year Built': '2002',
    'Number of Stories': '2',
  };

  it('returns a valid parsed row for well-formed input', () => {
    const parsed = parseRicochetRow(row, 1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.phoneNormalized).toBe('2052063492');
      expect(parsed.value.firstName).toBe('Ordrey');
      expect(parsed.value.leadDate).toBe('2026-04-22');
      expect(parsed.value.dwellingValue).toBe(217500);
      expect(parsed.value.campaign).toBe('2009 Older Homes');
      expect(parsed.value.payload).toMatchObject(row);
    }
  });

  it('returns an error for invalid phone', () => {
    const parsed = parseRicochetRow({ ...row, Phone: '' }, 1);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.reason).toBe('invalid_phone');
  });

  it('returns an error for invalid date', () => {
    const parsed = parseRicochetRow({ ...row, 'Lead Date': 'blah' }, 1);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.reason).toBe('invalid_date');
  });

  it('accepts blank numeric fields (stored as null)', () => {
    const parsed = parseRicochetRow({ ...row, 'Dwelling Value': '' }, 1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.dwellingValue).toBeNull();
  });
});

describe('dedupeRicochetRowsByPhone', () => {
  it('keeps the last occurrence when a phone appears multiple times', () => {
    const rows = [
      { rowNumber: 1, phoneNormalized: '2052063492', firstName: 'Old' },
      { rowNumber: 2, phoneNormalized: '9999999999', firstName: 'Other' },
      { rowNumber: 3, phoneNormalized: '2052063492', firstName: 'New' },
    ] as any;
    const { kept, dropped } = dedupeRicochetRowsByPhone(rows);
    expect(kept.map((r) => r.rowNumber)).toEqual([2, 3]);
    expect(dropped).toEqual([
      { rowNumber: 1, phoneNormalized: '2052063492', reason: 'duplicate_within_file' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/lib/ricochetParser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `src/lib/ricochetParser.ts`:

```ts
import { parse as parseDate, isValid as isValidDate, format as formatDate } from 'date-fns';

export interface RicochetRow {
  rowNumber: number;
  phoneRaw: string;
  phoneNormalized: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  campaign: string | null;
  leadDate: string;            // ISO YYYY-MM-DD
  dwellingValue: number | null;
  homeValue: number | null;
  leadCost: number | null;
  payload: Record<string, unknown>;
}

export type RicochetRowParseError = {
  rowNumber: number;
  reason:
    | 'invalid_phone'
    | 'invalid_date'
    | 'duplicate_within_file'
    | 'missing_required_column';
  detail?: string;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RicochetRowParseError };

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
}

export function parseLeadDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const formats = ['M/d/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'M-d-yyyy'];
  for (const fmt of formats) {
    const d = parseDate(s, fmt, new Date());
    if (isValidDate(d)) return formatDate(d, 'yyyy-MM-dd');
  }
  return null;
}

export function parseNumeric(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function pick(row: Record<string, unknown>, key: string): unknown {
  // Case-insensitive column access to match BatchDropSlot's detection behavior.
  const lowered = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lowered) return row[k];
  }
  return undefined;
}

export function parseRicochetRow(
  row: Record<string, unknown>,
  rowNumber: number
): ParseResult<RicochetRow> {
  const phoneRaw = String(pick(row, 'Phone') ?? '');
  const phoneNormalized = normalizePhone(phoneRaw);
  if (!phoneNormalized) {
    return { ok: false, error: { rowNumber, reason: 'invalid_phone' } };
  }

  const leadDate = parseLeadDate(String(pick(row, 'Lead Date') ?? ''));
  if (!leadDate) {
    return { ok: false, error: { rowNumber, reason: 'invalid_date' } };
  }

  return {
    ok: true,
    value: {
      rowNumber,
      phoneRaw,
      phoneNormalized,
      firstName: trimOrNull(pick(row, 'First Name')),
      lastName: trimOrNull(pick(row, 'Last Name')),
      email: trimOrNull(pick(row, 'Email')),
      streetAddress: trimOrNull(pick(row, 'Street Address')),
      city: trimOrNull(pick(row, 'City')),
      state: trimOrNull(pick(row, 'State')),
      zip: trimOrNull(pick(row, 'Zip')),
      campaign: trimOrNull(pick(row, 'Campaign')),
      leadDate,
      dwellingValue: parseNumeric(String(pick(row, 'Dwelling Value') ?? '')),
      homeValue: parseNumeric(String(pick(row, 'Home Value') ?? '')),
      leadCost: parseNumeric(String(pick(row, 'Cost') ?? '')),
      payload: row,
    },
  };
}

export function dedupeRicochetRowsByPhone(rows: RicochetRow[]): {
  kept: RicochetRow[];
  dropped: Array<{ rowNumber: number; phoneNormalized: string; reason: 'duplicate_within_file' }>;
} {
  // Last occurrence wins. Walk backward, track seen phones, keep first seen (which is the last in original order).
  const seen = new Set<string>();
  const keptReverse: RicochetRow[] = [];
  const dropped: Array<{ rowNumber: number; phoneNormalized: string; reason: 'duplicate_within_file' }> = [];

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (seen.has(r.phoneNormalized)) {
      dropped.push({ rowNumber: r.rowNumber, phoneNormalized: r.phoneNormalized, reason: 'duplicate_within_file' });
    } else {
      seen.add(r.phoneNormalized);
      keptReverse.push(r);
    }
  }
  const kept = keptReverse.reverse();
  dropped.reverse();
  return { kept, dropped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/lib/ricochetParser.test.ts
```

Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ricochetParser.ts src/lib/ricochetParser.test.ts
git commit -m "Add pure-function Ricochet parser with tests"
```

---

## Task 6: Build importRicochet (match detection + write)

**Files:**
- Create: `src/lib/importRicochet.ts`

- [ ] **Step 1: Read existing bulkLookupLeadsByPhone**

Read `src/lib/importService.ts` lines 270–340 to understand:
- The function signature (params, return shape)
- How `agencyId` is threaded through
- How chunking is handled (it was fixed to chunk at 500)

Take note — the new `detectRicochetMatches` will call it, so the shape must match.

- [ ] **Step 2: Implement importRicochet.ts**

Create `src/lib/importRicochet.ts`:

```ts
import { supabase } from '@/integrations/supabase/client';
import type { RicochetRow, RicochetRowParseError } from './ricochetParser';
import { parseRicochetRow, dedupeRicochetRowsByPhone } from './ricochetParser';
import * as XLSX from 'xlsx';

export interface RicochetMatch {
  incoming: RicochetRow;
  existing: {
    id: string;
    phoneNormalized: string;
    firstName: string | null;
    lastName: string | null;
    campaign: string | null;
    createdAt: string;
    streetAddress: string | null;
    city: string | null;
    state: string | null;
  };
}

export interface ParsedRicochetFile {
  rows: RicochetRow[];
  errors: RicochetRowParseError[];
}

export interface RicochetWriteSummary {
  rowsImported: number;   // new leads created
  rowsUpdated: number;    // existing leads overwritten
  requotesLogged: number; // total requote events
  errors: RicochetRowParseError[];
}

export type RicochetDecision = 'requote' | 'overwrite';

/**
 * Parse a Ricochet .csv/.xlsx file into typed rows + errors.
 * Pure (no DB access) — safe to call in the browser during "preview" step.
 */
export async function parseRicochetFile(file: File): Promise<ParsedRicochetFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const parsedRows: RicochetRow[] = [];
  const errors: RicochetRowParseError[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header row = 1
    const result = parseRicochetRow(row, rowNumber);
    if (result.ok) parsedRows.push(result.value);
    else errors.push(result.error);
  });

  const { kept, dropped } = dedupeRicochetRowsByPhone(parsedRows);
  errors.push(...dropped.map((d) => ({ rowNumber: d.rowNumber, reason: d.reason })));

  return { rows: kept, errors };
}

/**
 * Lookup existing leads in this agency whose phone matches any incoming row.
 * Chunked at 500 to stay under PostgREST URL limits.
 */
export async function detectRicochetMatches(
  rows: RicochetRow[],
  agencyId: string
): Promise<RicochetMatch[]> {
  if (rows.length === 0) return [];

  const phones = rows.map((r) => r.phoneNormalized);
  const chunkSize = 500;
  const existingByPhone = new Map<string, RicochetMatch['existing']>();

  for (let i = 0; i < phones.length; i += chunkSize) {
    const chunk = phones.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('leads')
      .select('id, phone_normalized, first_name, last_name, campaign, created_at, street_address, city, state')
      .eq('agency_id', agencyId)
      .in('phone_normalized', chunk);

    if (error) throw error;

    for (const lead of data ?? []) {
      existingByPhone.set(lead.phone_normalized as string, {
        id: lead.id as string,
        phoneNormalized: lead.phone_normalized as string,
        firstName: (lead.first_name as string | null) ?? null,
        lastName: (lead.last_name as string | null) ?? null,
        campaign: (lead.campaign as string | null) ?? null,
        createdAt: lead.created_at as string,
        streetAddress: (lead.street_address as string | null) ?? null,
        city: (lead.city as string | null) ?? null,
        state: (lead.state as string | null) ?? null,
      });
    }
  }

  return rows
    .filter((r) => existingByPhone.has(r.phoneNormalized))
    .map((r) => ({ incoming: r, existing: existingByPhone.get(r.phoneNormalized)! }));
}

/**
 * Merge: Ricochet overwrites existing fields where it has a non-blank value;
 * blanks preserve existing data. Returns a partial lead row suitable for UPDATE.
 */
export function mergeLeadOverwrite(
  existing: { first_name: string | null; last_name: string | null; email: string | null;
              street_address: string | null; city: string | null; state: string | null;
              zip: string | null; campaign: string | null; lead_date: string | null;
              dwelling_value: number | null; home_value: number | null; lead_cost: number | null; },
  incoming: RicochetRow
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  if (incoming.firstName    != null) merged.first_name     = incoming.firstName;
  if (incoming.lastName     != null) merged.last_name      = incoming.lastName;
  if (incoming.email        != null) merged.email          = incoming.email;
  if (incoming.streetAddress!= null) merged.street_address = incoming.streetAddress;
  if (incoming.city         != null) merged.city           = incoming.city;
  if (incoming.state        != null) merged.state          = incoming.state;
  if (incoming.zip          != null) merged.zip            = incoming.zip;
  if (incoming.campaign     != null) merged.campaign       = incoming.campaign;
  if (incoming.leadDate     != null) merged.lead_date      = incoming.leadDate;
  if (incoming.dwellingValue!= null) merged.dwelling_value = incoming.dwellingValue;
  if (incoming.homeValue    != null) merged.home_value     = incoming.homeValue;
  if (incoming.leadCost     != null) merged.lead_cost      = incoming.leadCost;
  return merged;
}

/**
 * Phase 0 write. Assumes the uploads row has already been created by importBatch
 * (so failures in this function can be rolled back via deleteBatch).
 */
export async function writeRicochetPhase(params: {
  uploadId: string;
  batchId: string;
  agencyId: string;
  rows: RicochetRow[];
  existingMatches: Map<string, RicochetMatch['existing']>; // keyed by phone_normalized
  decisions: Map<string, RicochetDecision>;                // keyed by phone_normalized; missing = 'requote' default
  parseErrors: RicochetRowParseError[];
}): Promise<RicochetWriteSummary> {
  const { uploadId, batchId, agencyId, rows, existingMatches, decisions, parseErrors } = params;

  // 1. Bulk insert raw_ricochet_rows.
  const rawInserts = rows.map((r) => ({
    upload_id: uploadId,
    batch_id: batchId,
    agency_id: agencyId,
    row_number: r.rowNumber,
    phone_raw: r.phoneRaw,
    phone_normalized: r.phoneNormalized,
    first_name: r.firstName,
    last_name: r.lastName,
    email: r.email,
    street_address: r.streetAddress,
    city: r.city,
    state: r.state,
    zip: r.zip,
    campaign: r.campaign,
    lead_date: r.leadDate,
    dwelling_value: r.dwellingValue,
    home_value: r.homeValue,
    lead_cost: r.leadCost,
    payload: r.payload,
  }));

  const { data: rawRowsInserted, error: rawErr } = await supabase
    .from('raw_ricochet_rows')
    .insert(rawInserts)
    .select('id, phone_normalized');
  if (rawErr) throw rawErr;

  const rawIdByPhone = new Map<string, string>();
  for (const rr of rawRowsInserted ?? []) {
    rawIdByPhone.set(rr.phone_normalized as string, rr.id as string);
  }

  // 2. Route each row.
  let rowsImported = 0;
  let rowsUpdated = 0;
  let requotesLogged = 0;

  for (const r of rows) {
    const match = existingMatches.get(r.phoneNormalized);
    const decision = decisions.get(r.phoneNormalized) ?? 'requote';

    if (!match) {
      // No match → INSERT new lead.
      const { error: insErr } = await supabase.from('leads').insert({
        agency_id: agencyId,
        phone_normalized: r.phoneNormalized,
        first_name: r.firstName,
        last_name: r.lastName,
        email: r.email,
        street_address: r.streetAddress,
        city: r.city,
        state: r.state,
        zip: r.zip,
        campaign: r.campaign,
        lead_date: r.leadDate,
        dwelling_value: r.dwellingValue,
        home_value: r.homeValue,
        lead_cost: r.leadCost,
        ricochet_source_upload_id: uploadId,
      });
      if (insErr) throw insErr;
      rowsImported++;
      continue;
    }

    // Match — log requote event regardless of decision.
    if (decision === 'overwrite') {
      // Fetch existing to apply blank-preserving merge.
      const { data: existingLead, error: fetchErr } = await supabase
        .from('leads')
        .select('first_name, last_name, email, street_address, city, state, zip, campaign, lead_date, dwelling_value, home_value, lead_cost')
        .eq('id', match.id)
        .single();
      if (fetchErr) throw fetchErr;

      const merged = mergeLeadOverwrite(existingLead as any, r);
      if (Object.keys(merged).length > 0) {
        const { error: updErr } = await supabase
          .from('leads')
          .update(merged)
          .eq('id', match.id);
        if (updErr) throw updErr;
      }
      rowsUpdated++;
    }

    const { error: reqErr } = await supabase.from('lead_requote_events').insert({
      lead_id: match.id,
      upload_id: uploadId,
      batch_id: batchId,
      agency_id: agencyId,
      raw_row_id: rawIdByPhone.get(r.phoneNormalized) ?? null,
      campaign: r.campaign,
      lead_cost: r.leadCost,
      lead_date: r.leadDate,
      was_overwritten: decision === 'overwrite',
    });
    if (reqErr) throw reqErr;
    requotesLogged++;
  }

  return { rowsImported, rowsUpdated, requotesLogged, errors: parseErrors };
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors. (If `phone_normalized` isn't a column on `leads`, the migration in Task 1 missed it — go back and add it.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/importRicochet.ts
git commit -m "Add Ricochet Phase 0 importer (parse, match, write)"
```

---

## Task 7: Extend importService.ts — types, importBatch, resumeBatch, Phase 1/2 skip

**Files:**
- Modify: `src/lib/importService.ts`

This is the largest task. Do it in sub-steps with a commit between each.

### Task 7a: Add new types

- [ ] **Step 1: Read the BatchResult type block**

Read `src/lib/importService.ts` lines 50–150 to see the existing `BatchProgress`, `BatchResult`, any `BatchRollbackError`, and how the `dailyCall` / `deerDama` summary shapes look.

- [ ] **Step 2: Add the new types near the existing ones**

Insert after the existing `BatchResult` interface (around line 62):

```ts
import type { RicochetMatch, RicochetWriteSummary, RicochetDecision } from './importRicochet';
import type { RicochetRow } from './ricochetParser';

export type RequoteDecision = RicochetDecision;

export interface ParsedBatchState {
  ricochetFile: File;
  ricochetRows: RicochetRow[];
  ricochetParseErrors: { rowNumber: number; reason: string }[];
  existingMatches: RicochetMatch[];
  dailyCallFile: File;
  deerDamaFile: File;
}

export type ImportBatchResult =
  | {
      status: 'success';
      result: BatchResult;
    }
  | {
      status: 'duplicate';
      duplicateOf: BatchResult['duplicateOf'];
    }
  | {
      status: 'needs_requote_review';
      pendingBatchId: string;
      matches: RicochetMatch[];
      parsedState: ParsedBatchState;
    };
```

Also extend the existing `BatchResult` interface to add the `ricochet` summary block (so Phase 0 results have somewhere to live):

```ts
export interface BatchResult {
  batchId: string;
  rolledBack: boolean;
  ricochet?: RicochetWriteSummary;
  dailyCall: { /* existing fields */; rowsSkippedUnmatched?: number };
  deerDama: { /* existing fields */; rowsSkippedUnmatched?: number };
  // ... existing fields (duplicateOf, etc.)
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Add Ricochet-related types to importService"
```

### Task 7b: Add phone_not_in_leads skip to Phase 1 (Daily Call)

- [ ] **Step 1: Locate the insertion point**

Inside `importDailyCallReport` (starts line 336), find where rows are about to be inserted into `call_events` (or wherever call rows land). Before that insert, each row's phone must be looked up against `leads` (scoped to `agencyId`). Rows whose phone isn't present are skipped and logged to `import_errors` with `reason = 'phone_not_in_leads'`.

- [ ] **Step 2: Add a pre-filter step using bulkLookupLeadsByPhone**

Pseudocode for the addition (place before the existing event-insert loop):

```ts
const incomingPhones = parsedRows.map((r) => r.phoneNormalized).filter(Boolean);
const leadsByPhone = await bulkLookupLeadsByPhone(incomingPhones, agencyId);
// leadsByPhone: Map<string, {id: string}> or similar — match the existing return shape

const unmatchedErrors: ImportError[] = [];
const matchedRows = parsedRows.filter((r) => {
  if (leadsByPhone.has(r.phoneNormalized)) return true;
  unmatchedErrors.push({
    upload_id: uploadId,
    row_number: r.rowNumber,
    reason: 'phone_not_in_leads',
    detail: `phone=${r.phoneNormalized}`,
  });
  return false;
});

// ... continue with matchedRows instead of parsedRows
// ... append unmatchedErrors to the errors array returned by the function
// ... return summary with rowsSkippedUnmatched: unmatchedErrors.length
```

Adapt names and shapes to match the actual code. The key invariants:
- Skipped rows are logged, not errors thrown.
- Summary returns `rowsSkippedUnmatched`.
- The existing phase-failure guard (`errors.length > 0 AND rowsImported === 0` → rollback) must not treat unmatched rows as fatal unless literally nothing imports. Confirm that: after the filter, if `matchedRows.length === 0` and the file wasn't empty, that's fine — Phase 0 either did nothing or created leads that DC events don't cover. This is a skipped-everything-but-valid scenario, not a rollback.

- [ ] **Step 3: Update the Phase 1 return shape to include rowsSkippedUnmatched**

Update wherever `importDailyCallReport` constructs its return summary.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Skip Daily Call rows whose phone is not in leads"
```

### Task 7c: Add the same skip to Phase 2 (Deer Dama)

- [ ] **Step 1: Locate the insertion point in `importDeerDamaReport` (starts line 804)**

Find where rows are inserted into the deer-damage downstream tables (likely `raw_deer_dama_rows` is already written; the lead-attaching step is what needs guarding). The pre-filter must go before any per-row insert that assumes a lead row exists.

- [ ] **Step 2: Add the pre-filter**

Insert before the event/lead-linking loop in `importDeerDamaReport`:

```ts
const incomingPhones = parsedRows.map((r) => r.phoneNormalized).filter(Boolean);
const leadsByPhone = await bulkLookupLeadsByPhone(incomingPhones, agencyId);

const unmatchedErrors: ImportError[] = [];
const matchedRows = parsedRows.filter((r) => {
  if (leadsByPhone.has(r.phoneNormalized)) return true;
  unmatchedErrors.push({
    upload_id: uploadId,
    row_number: r.rowNumber,
    reason: 'phone_not_in_leads',
    detail: `phone=${r.phoneNormalized}`,
  });
  return false;
});

// continue with matchedRows instead of parsedRows
// append unmatchedErrors to the errors array returned by the function
// return summary with rowsSkippedUnmatched: unmatchedErrors.length
```

Adapt names (`parsedRows`, `ImportError`) to match the actual variable names in `importDeerDamaReport` — they may differ from the Daily Call path.

- [ ] **Step 3: Update the return shape**

Update the summary returned by `importDeerDamaReport` to include `rowsSkippedUnmatched: unmatchedErrors.length`.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/importService.ts
git commit -m "Skip Deer Dama rows whose phone is not in leads"
```

### Task 7d: Extend importBatch to Phase 0 with requote pause

- [ ] **Step 1: Read the current importBatch**

Read `src/lib/importService.ts` lines 1250–1347 to see:
- The current signature and arguments
- How file-hash duplicate detection is structured
- Where `safeRollback` is called from

- [ ] **Step 2: Add Phase 0 + pause logic**

Change `importBatch`'s signature to accept a Ricochet file. Add Phase 0 BEFORE the existing phase 1 file-hash check:

```ts
export async function importBatch(params: {
  ricochetFile: File;
  dailyCallFile: File;
  deerDamaFile: File;
  uploadDate: string;
  agencyId: string;
  force?: boolean;
}): Promise<ImportBatchResult> {
  const { ricochetFile, dailyCallFile, deerDamaFile, uploadDate, agencyId, force } = params;

  // 1. Duplicate hash check — extended to all 3 files in parallel.
  if (!force) {
    const [ricoHash, dcHash, ddHash] = await Promise.all([
      hashFile(ricochetFile),
      hashFile(dailyCallFile),
      hashFile(deerDamaFile),
    ]);
    const dupe = await checkAnyUploadHashExists([ricoHash, dcHash, ddHash], agencyId);
    if (dupe) return { status: 'duplicate', duplicateOf: dupe };
  }

  // 2. Parse Ricochet file and detect matches (no writes yet).
  const parsed = await parseRicochetFile(ricochetFile);
  const matches = await detectRicochetMatches(parsed.rows, agencyId);

  const batchId = crypto.randomUUID();

  if (matches.length > 0) {
    return {
      status: 'needs_requote_review',
      pendingBatchId: batchId,
      matches,
      parsedState: {
        ricochetFile,
        ricochetRows: parsed.rows,
        ricochetParseErrors: parsed.errors,
        existingMatches: matches,
        dailyCallFile,
        deerDamaFile,
      },
    };
  }

  // No matches → proceed straight to write.
  return finalizeBatch({
    batchId,
    agencyId,
    uploadDate,
    ricochetFile,
    parsedRicochet: parsed,
    existingMatches: [],
    decisions: new Map(),
    dailyCallFile,
    deerDamaFile,
  });
}
```

- [ ] **Step 3: Add the finalizeBatch helper + resumeBatch entry point**

Below `importBatch`:

```ts
interface FinalizeParams {
  batchId: string;
  agencyId: string;
  uploadDate: string;
  ricochetFile: File;
  parsedRicochet: ParsedRicochetFile;
  existingMatches: RicochetMatch[];
  decisions: Map<string, RicochetDecision>;
  dailyCallFile: File;
  deerDamaFile: File;
}

async function finalizeBatch(p: FinalizeParams): Promise<ImportBatchResult> {
  const { batchId, agencyId, uploadDate, ricochetFile, parsedRicochet, existingMatches, decisions, dailyCallFile, deerDamaFile } = p;

  // Phase 0 — Ricochet write
  let ricochetSummary: RicochetWriteSummary;
  let ricochetUploadId: string;
  try {
    // Insert uploads row first (so writes can be tied to it).
    const ricoHash = await hashFile(ricochetFile);
    const { data: upRow, error: upErr } = await supabase.from('uploads').insert({
      report_type: 'ricochet_lead_list',
      agency_id: agencyId,
      upload_date: uploadDate,
      batch_id: batchId,
      file_hash: ricoHash,
      status: 'processing',
    }).select('id').single();
    if (upErr) throw upErr;
    ricochetUploadId = upRow.id;

    const matchMap = new Map(existingMatches.map((m) => [m.incoming.phoneNormalized, m.existing]));
    ricochetSummary = await writeRicochetPhase({
      uploadId: ricochetUploadId,
      batchId,
      agencyId,
      rows: parsedRicochet.rows,
      existingMatches: matchMap,
      decisions,
      parseErrors: parsedRicochet.errors,
    });

    await supabase.from('uploads')
      .update({ status: parsedRicochet.errors.length > 0 ? 'complete_with_errors' : 'complete' })
      .eq('id', ricochetUploadId);
  } catch (e) {
    const rollbackErr = await safeRollback(batchId);
    throw makeRollbackError('ricochet', e, rollbackErr);
  }

  // Phase 1 — Daily Call (existing, now matches unmatched-phone skip)
  let dailyCallResult: ImportResult;
  try {
    dailyCallResult = await importDailyCallReport({ file: dailyCallFile, uploadDate, agencyId, batchId, force: true });
    if (dailyCallResult.errors.length > 0 && dailyCallResult.rowsImported === 0) {
      throw new Error(`Daily Call import produced only errors (${dailyCallResult.errors.length}).`);
    }
  } catch (e) {
    const rollbackErr = await safeRollback(batchId);
    throw makeRollbackError('daily_call', e, rollbackErr);
  }

  // Phase 2 — Deer Dama
  let deerDamaResult: ImportResult;
  try {
    deerDamaResult = await importDeerDamaReport({ file: deerDamaFile, uploadDate, agencyId, batchId, force: true });
  } catch (e) {
    const rollbackErr = await safeRollback(batchId);
    throw makeRollbackError('deer_dama', e, rollbackErr);
  }

  return {
    status: 'success',
    result: {
      batchId,
      rolledBack: false,
      ricochet: ricochetSummary,
      dailyCall: dailyCallResult,
      deerDama: deerDamaResult,
    },
  };
}

export async function resumeBatch(
  pendingBatchId: string,
  decisions: Map<string, RicochetDecision>,
  parsedState: ParsedBatchState,
  uploadDate: string,
  agencyId: string
): Promise<ImportBatchResult> {
  return finalizeBatch({
    batchId: pendingBatchId,
    agencyId,
    uploadDate,
    ricochetFile: parsedState.ricochetFile,
    parsedRicochet: {
      rows: parsedState.ricochetRows,
      errors: parsedState.ricochetParseErrors as any,
    },
    existingMatches: parsedState.existingMatches,
    decisions,
    dailyCallFile: parsedState.dailyCallFile,
    deerDamaFile: parsedState.deerDamaFile,
  });
}
```

**Note:** `ParsedBatchState` and `FinalizeParams` both include the original `ricochetFile` (added in Task 7a and the `FinalizeParams` interface above), so `finalizeBatch` can call `hashFile(ricochetFile)` directly. This also enables `resumeBatch` to re-hash after the interactive pause without needing the browser to retain a hash in state.

- [ ] **Step 4: Typecheck iteratively**

```bash
npx tsc --noEmit
```

Fix any errors. Common issues:
- Phase 1/2 importers may expect different param names — adapt the call sites.
- `ImportResult` type may need `rowsSkippedUnmatched` added.

- [ ] **Step 5: Commit**

```bash
git add src/lib/importService.ts
git commit -m "Extend importBatch to 3 phases with Ricochet requote pause"
```

---

## Task 8: Build the RequoteReviewDialog component

**Files:**
- Create: `src/components/upload/RequoteReviewDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RicochetMatch } from '@/lib/importRicochet';

export type RicochetDecision = 'requote' | 'overwrite';

export interface RequoteReviewDialogProps {
  open: boolean;
  matches: RicochetMatch[];
  onConfirm: (decisions: Map<string, RicochetDecision>) => void;
  onCancel: () => void;
}

export default function RequoteReviewDialog({ open, matches, onConfirm, onCancel }: RequoteReviewDialogProps) {
  const [decisions, setDecisions] = useState<Record<string, RicochetDecision>>(() =>
    Object.fromEntries(matches.map((m) => [m.incoming.phoneNormalized, 'requote' as RicochetDecision]))
  );

  const count = matches.length;

  const setOne = (phone: string, d: RicochetDecision) =>
    setDecisions((prev) => ({ ...prev, [phone]: d }));

  const setAll = (d: RicochetDecision) =>
    setDecisions(Object.fromEntries(matches.map((m) => [m.incoming.phoneNormalized, d])));

  const confirm = () => {
    const map = new Map<string, RicochetDecision>(Object.entries(decisions));
    onConfirm(map);
  };

  const formatPhone = (p: string) =>
    p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Phone Matches Found — Review Before Import</DialogTitle>
          <DialogDescription>
            {count} incoming {count === 1 ? 'lead matches an existing lead' : 'leads match existing leads'} by phone.
            Choose how to handle each, or use the bulk actions below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 py-2">
          <Button variant="outline" size="sm" onClick={() => setAll('requote')}>
            Mark all as requote
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAll('overwrite')}>
            Overwrite all
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh] rounded-md border">
          <div className="divide-y">
            {matches.map((m) => {
              const d = decisions[m.incoming.phoneNormalized] ?? 'requote';
              return (
                <MatchCard
                  key={m.incoming.phoneNormalized}
                  phone={formatPhone(m.incoming.phoneNormalized)}
                  match={m}
                  decision={d}
                  onChange={(next) => setOne(m.incoming.phoneNormalized, next)}
                />
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="destructive" onClick={onCancel}>Cancel Import</Button>
          <Button onClick={confirm}>Confirm &amp; Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchCard({
  phone, match, decision, onChange,
}: {
  phone: string;
  match: RicochetMatch;
  decision: RicochetDecision;
  onChange: (d: RicochetDecision) => void;
}) {
  const { incoming, existing } = match;

  const overwriteFieldsThatWillBeWiped = useMemo(() => {
    if (decision !== 'overwrite') return new Set<string>();
    const wiped = new Set<string>();
    // Per spec: blanks preserve existing, so nothing is ever actually wiped.
    // Visual affordance only — show amber when Overwrite is chosen AND the
    // incoming value would change the existing one.
    return wiped;
  }, [decision]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm">{phone}</span>
        <Select value={decision} onValueChange={(v) => onChange(v as RicochetDecision)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="requote">Requote</SelectItem>
            <SelectItem value="overwrite">Overwrite</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-muted-foreground font-semibold mb-1">Existing (keep)</div>
          <div>{[existing.firstName, existing.lastName].filter(Boolean).join(' ') || '—'}</div>
          <div>{[existing.streetAddress, existing.city, existing.state].filter(Boolean).join(', ') || '—'}</div>
          <div>Campaign: {existing.campaign ?? '—'}</div>
          <div className="text-muted-foreground">Added {new Date(existing.createdAt).toLocaleDateString()}</div>
        </div>
        <div className={decision === 'overwrite' ? 'bg-amber-50 dark:bg-amber-950/30 rounded p-2 -m-2' : ''}>
          <div className="text-muted-foreground font-semibold mb-1">Incoming (Ricochet)</div>
          <div>{[incoming.firstName, incoming.lastName].filter(Boolean).join(' ') || '—'}</div>
          <div>{[incoming.streetAddress, incoming.city, incoming.state].filter(Boolean).join(', ') || '—'}</div>
          <div>Campaign: {incoming.campaign ?? '—'}</div>
          <div className="text-muted-foreground">Lead date {incoming.leadDate}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/upload/RequoteReviewDialog.tsx
git commit -m "Add RequoteReviewDialog for phone match review"
```

---

## Task 9: Extend UploadCenter — state, 3-slot layout, dialog wiring, summary

**Files:**
- Modify: `src/pages/UploadCenter.tsx`

### Task 9a: Extend BatchState and initial state

- [ ] **Step 1: Update the BatchState interface (around line 30)**

Replace with:

```ts
interface BatchState {
  step: 'select' | 'preview' | 'requote_review' | 'importing' | 'summary';
  ricochet: BatchDropSlotValue | null;
  dailyCall: BatchDropSlotValue | null;
  deerDama: BatchDropSlotValue | null;
  uploadDate: string | null;
  requoteMatches: RicochetMatch[] | null;
  requoteDecisions: Map<string, RicochetDecision> | null;
  parsedState: ParsedBatchState | null;
  pendingBatchId: string | null;
  progress: BatchProgress | null;
  result: BatchResult | null;
  rollbackMessage: string | null;
}

const initialState: BatchState = {
  step: 'select',
  ricochet: null,
  dailyCall: null,
  deerDama: null,
  uploadDate: null,
  requoteMatches: null,
  requoteDecisions: null,
  parsedState: null,
  pendingBatchId: null,
  progress: null,
  result: null,
  rollbackMessage: null,
};
```

Update the imports at the top:

```ts
import {
  importBatch,
  resumeBatch,
  type BatchResult,
  type BatchProgress,
  type ParsedBatchState,
  type RicochetDecision,
} from '@/lib/importService';
import type { RicochetMatch } from '@/lib/importRicochet';
import RequoteReviewDialog from '@/components/upload/RequoteReviewDialog';
```

### Task 9b: Update the 3-slot layout

- [ ] **Step 1: Replace the existing 2-slot render block**

The current render shows two `BatchDropSlot` components (around lines 170–190). Replace with three, in this order, with the DC/DD slots receiving `disabled={!state.ricochet}`:

```tsx
<div className="space-y-4">
  <section>
    <h3 className="text-sm font-semibold mb-2">1. Ricochet Lead List <span className="text-muted-foreground font-normal">(required first)</span></h3>
    <BatchDropSlot
      value={state.ricochet}
      onChange={(v) => setState((s) => ({ ...s, ricochet: v }))}
      expectedType={REPORT_TYPES.RICOCHET_LEAD_LIST}
    />
  </section>

  <section>
    <h3 className="text-sm font-semibold mb-2">2. Daily Call Report</h3>
    <BatchDropSlot
      value={state.dailyCall}
      onChange={(v) => setState((s) => ({ ...s, dailyCall: v }))}
      expectedType={REPORT_TYPES.DAILY_CALL}
      disabled={!state.ricochet}
      disabledHelperText="Upload the Ricochet Lead List first."
    />
  </section>

  <section>
    <h3 className="text-sm font-semibold mb-2">3. Deer Damage (Lead) Report</h3>
    <BatchDropSlot
      value={state.deerDama}
      onChange={(v) => setState((s) => ({ ...s, deerDama: v }))}
      expectedType={REPORT_TYPES.DEER_DAMA}
      disabled={!state.ricochet}
      disabledHelperText="Upload the Ricochet Lead List first."
    />
  </section>
</div>
```

- [ ] **Step 2: Update the Continue button disabled check**

The button must be disabled unless all three slots are populated, all three `typeMatches === true`, and `uploadDate` is set.

```tsx
const canContinue =
  state.ricochet != null && state.ricochet.typeMatches &&
  state.dailyCall != null && state.dailyCall.typeMatches &&
  state.deerDama != null && state.deerDama.typeMatches &&
  state.uploadDate != null;
```

### Task 9c: Wire importBatch, resumeBatch, and the dialog

- [ ] **Step 1: Update runBatch**

Locate `handleImport` / `runBatch` (around line 74 area based on the memory snapshot). Replace with:

```ts
const runBatch = async (force: boolean) => {
  if (!state.ricochet || !state.dailyCall || !state.deerDama || !state.uploadDate) return;
  if (!agencyId) return;

  setState((s) => ({ ...s, step: 'importing', progress: { phase: 'ricochet', current: 0, total: 0 } }));

  try {
    const res = await importBatch({
      ricochetFile: state.ricochet.file,
      dailyCallFile: state.dailyCall.file,
      deerDamaFile: state.deerDama.file,
      uploadDate: state.uploadDate,
      agencyId,
      force,
    });

    if (res.status === 'duplicate') {
      setState((s) => ({ ...s, step: 'preview' }));
      setDuplicatePrompt(res.duplicateOf);
      return;
    }

    if (res.status === 'needs_requote_review') {
      setState((s) => ({
        ...s,
        step: 'requote_review',
        requoteMatches: res.matches,
        requoteDecisions: new Map(res.matches.map((m) => [m.incoming.phoneNormalized, 'requote' as RicochetDecision])),
        parsedState: res.parsedState,
        pendingBatchId: res.pendingBatchId,
      }));
      return;
    }

    // success
    setState((s) => ({ ...s, step: 'summary', result: res.result }));
    invalidateCaches();
  } catch (e) {
    handleBatchError(e, setState, invalidateCaches);
  }
};

const handleRequoteConfirm = async (decisions: Map<string, RicochetDecision>) => {
  if (!state.parsedState || !state.pendingBatchId || !state.uploadDate || !agencyId) return;
  setState((s) => ({ ...s, step: 'importing', requoteDecisions: decisions }));
  try {
    const res = await resumeBatch(state.pendingBatchId, decisions, state.parsedState, state.uploadDate, agencyId);
    if (res.status === 'success') {
      setState((s) => ({ ...s, step: 'summary', result: res.result }));
      invalidateCaches();
    }
  } catch (e) {
    handleBatchError(e, setState, invalidateCaches);
  }
};

const handleRequoteCancel = () => {
  setState(initialState);
};
```

Where `handleBatchError` and `invalidateCaches` are existing helpers (or extract them inline if they aren't).

- [ ] **Step 2: Render the RequoteReviewDialog**

Anywhere in the returned JSX (outside the step-switch):

```tsx
<RequoteReviewDialog
  open={state.step === 'requote_review' && state.requoteMatches != null}
  matches={state.requoteMatches ?? []}
  onConfirm={handleRequoteConfirm}
  onCancel={handleRequoteCancel}
/>
```

### Task 9d: Update the summary step

- [ ] **Step 1: Render three result blocks**

When `state.step === 'summary' && state.result`, render:

```tsx
<div className="space-y-4">
  {state.result.ricochet && (
    <SummaryBlock
      title="Ricochet Lead List"
      rows={[
        { icon: 'success', text: `${state.result.ricochet.rowsImported} new leads created` },
        { icon: 'success', text: `${state.result.ricochet.rowsUpdated} leads updated (overwritten)` },
        { icon: 'info',    text: `${state.result.ricochet.requotesLogged} requotes logged` },
        { icon: 'warn',    text: `${state.result.ricochet.errors.length} rows skipped`, onClick: () => openErrorsModal(state.result!.ricochet!.errors) },
      ]}
    />
  )}
  <SummaryBlock
    title="Daily Call Report"
    rows={[
      { icon: 'success', text: `${state.result.dailyCall.rowsImported} call events imported` },
      { icon: 'warn',    text: `${state.result.dailyCall.rowsSkippedUnmatched ?? 0} rows skipped (phone not in leads)`, onClick: /* opens skip modal */ },
    ]}
  />
  <SummaryBlock
    title="Deer Damage Report"
    rows={[
      { icon: 'success', text: `${state.result.deerDama.rowsImported} lead records imported` },
      { icon: 'warn',    text: `${state.result.deerDama.rowsSkippedUnmatched ?? 0} rows skipped (phone not in leads)`, onClick: /* opens skip modal */ },
    ]}
  />
</div>
```

`SummaryBlock` is a small presentational component — extract it inline or in its own file. Rows with `onClick` are buttons; rows without are plain text.

A `SkippedRowsModal` dialog opens the skipped rows list with CSV export. This can reuse the existing CSV export util (grep `csvExport\|toCSV` in `src/lib` to find it).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/UploadCenter.tsx src/components/upload/RequoteReviewDialog.tsx
git commit -m "Wire 3-slot Ricochet flow in UploadCenter"
```

---

## Task 10: Browser verification

Manual testing — no automation. Report status to user at each bullet.

**Setup:**
- [ ] **Step 1:** Run `npm run dev`, log in as an admin and also as a non-admin customer. Have three test files ready:
  - A valid Ricochet CSV (use `LeadListExample.csv` from project root)
  - A valid Daily Call CSV with at least one phone that's in the Ricochet file AND one phone that isn't
  - A valid Deer Dama CSV with at least one phone not in the Ricochet file
  - A second Ricochet file overlapping with the first by at least 3 phones (for the requote dialog)

**Happy path — new leads only (no matches):**
- [ ] **Step 2:** On a fresh agency, upload Ricochet + DC + DD (first time). The requote dialog should NOT open (no matches). Summary should show all three phases succeeded, with Ricochet showing N new leads, 0 updated, 0 requotes.

**Match path — requote default:**
- [ ] **Step 3:** Upload a second Ricochet (with overlapping phones) + fresh DC + DD. Requote dialog opens. Default all to "Requote" and confirm. Verify: existing lead rows unchanged in DB, new `lead_requote_events` rows exist.

**Match path — overwrite:**
- [ ] **Step 4:** Upload another Ricochet with overlapping phones. In the dialog, switch one row to "Overwrite." Confirm. Verify: that lead's fields updated (inspect the `leads` row); `lead_requote_events` has `was_overwritten=true` for that phone.

**Cancel paths:**
- [ ] **Step 5:** Trigger the requote dialog, click "Cancel Import." Verify no uploads, no raw rows, no lead_requote_events, no new leads were created.
- [ ] **Step 6:** Trigger the duplicate-file prompt (re-upload a file that was imported). Click Cancel. Same verification.

**Unmatched phone skip:**
- [ ] **Step 7:** Ensure DC has a phone not in Ricochet. After import, summary should show "X rows skipped (phone not in leads)" for DC. Click it — modal opens with the skipped row, CSV export works.

**Rollback path:**
- [ ] **Step 8:** Simulate a Phase 2 failure. Easiest: temporarily edit the DD file to have invalid content that the parser rejects at the database level, or block RLS. After failure, verify `deleteBatch` ran — no uploads, no leads created by this batch, no requote events, no raw_ricochet_rows.

**Locked-slot UX:**
- [ ] **Step 9:** With no Ricochet file, try to drop a file into the DC slot. Verify the slot is locked (lock icon, muted background, helper text). Drop a Ricochet file — DC/DD slots should unlock.

**Admin delete-by-batch:**
- [ ] **Step 10:** As an admin, open upload history and delete a batch that contains a Ricochet upload. Verify the Ricochet upload, its raw rows, its requote events, its DC upload, and its DD upload all disappear. Leads created by the Ricochet upload should have `ricochet_source_upload_id` → NULL but otherwise remain.

**Concurrency sanity:**
- [ ] **Step 11:** Kick off one batch, then (while it's running) kick off a second one in another tab with overlapping phones. Verify the second one either (a) completes cleanly with requotes logged, or (b) fails cleanly with `safeRollback` due to `leads_agency_phone_unique` — no half-state.

- [ ] **Step 12:** Commit any UX tweaks discovered during testing:

```bash
git add -A
git commit -m "UX polish from browser testing"
```

---

## Spec Coverage Check

| Spec section | Task(s) |
|---|---|
| §2 In scope — 3-slot batch | Task 4, 9 |
| §2 In scope — seed leads | Task 6, 7 |
| §2 In scope — requote dialog + events | Task 8, 9 |
| §2 In scope — DC/DD unmatched skip | Task 7b, 7c |
| §2 In scope — atomic rollback | Task 7d (extends existing) |
| §5.1 leads columns | Task 1 |
| §5.2 raw_ricochet_rows | Task 1 |
| §5.3 lead_requote_events | Task 1 |
| §5.4 report_type enum | Task 1 |
| §5.5 UNIQUE constraint | Task 1 |
| §5.6 RLS policies | Task 1 |
| §5.7 Cascade semantics | Task 1 (FK definitions) |
| §6.1 Phase 0 parse/normalize | Task 5, 6 |
| §6.1 match detection | Task 6 |
| §6.1 pause + resume | Task 7d |
| §6.1 write step | Task 6 |
| §6.2 Phase 1 skip | Task 7b |
| §6.3 Phase 2 skip | Task 7c |
| §6.4 pause semantics | Task 7d |
| §6.5 BatchResult shape | Task 7a |
| §6.6 failure matrix | Task 7d (rollback paths), Task 10 (verification) |
| §7.1 layout | Task 9b |
| §7.2 BatchDropSlot extension | Task 4 |
| §7.3 BatchState shape | Task 9a |
| §7.4 RequoteReviewDialog | Task 8 |
| §7.5 preview step | (Falls out of 9b — all three slot previews already render) |
| §7.6 summary step | Task 9d |
| §7.7 upload history | No change needed (existing batch_id grouping works) |
| §7.8 cancel semantics | Task 9c (`handleRequoteCancel`), existing duplicate-cancel behavior |
| §8.1 row validation | Task 5 |
| §8.2 file validation | Task 4 (detectReportType ≥5), existing BatchDropSlot behavior |
| §8.3 batch preconditions | Task 9b (canContinue) |
| §8.4 duplicate-file detection | Task 7d |
| §8.5 concurrency (UNIQUE constraint) | Task 1 |
| §8.6 requote edge cases | Tasks 5, 6, 8 |
| §8.7 observability | Task 7d (status transitions) |
| §8.8 agency scoping | Task 1 (RLS + agency_id columns), Task 6 (agencyId threading) |
