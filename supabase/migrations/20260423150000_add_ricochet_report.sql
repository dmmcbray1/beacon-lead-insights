-- Ricochet Lead List — third report type in paired batch upload.
--
-- Notes on naming / conventions verified against existing migrations:
--   * uploads.report_type is a TEXT CHECK constraint (not a native ENUM),
--     defined in 20260320184153_...sql as:
--       CHECK (report_type IN ('daily_call_report', 'deer_dama_report'))
--     We extend it here with 'ricochet_lead_list'.
--   * leads uses column `normalized_phone` (not `phone_normalized`) and
--     already has a table-level UNIQUE (agency_id, normalized_phone) from
--     the initial migration, so no new unique constraint is needed.
--   * RLS policies follow the pattern in 20260322220909_...sql and
--     20260324000000_allow_customer_import.sql: admin via
--     public.has_role(auth.uid(), 'admin'); customer scope via
--     public.get_user_approval_status(auth.uid()) = 'approved'
--     AND agency_id = public.get_user_agency_id(auth.uid()).

BEGIN;

-- =========================================================
-- 1. leads: new columns (additive, IF NOT EXISTS)
-- =========================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_name                 text,
  ADD COLUMN IF NOT EXISTS last_name                  text,
  ADD COLUMN IF NOT EXISTS email                      text,
  ADD COLUMN IF NOT EXISTS street_address             text,
  ADD COLUMN IF NOT EXISTS city                       text,
  ADD COLUMN IF NOT EXISTS state                      text,
  ADD COLUMN IF NOT EXISTS zip                        text,
  ADD COLUMN IF NOT EXISTS campaign                   text,
  ADD COLUMN IF NOT EXISTS lead_date                  date,
  ADD COLUMN IF NOT EXISTS dwelling_value             numeric,
  ADD COLUMN IF NOT EXISTS home_value                 numeric,
  ADD COLUMN IF NOT EXISTS lead_cost                  numeric,
  ADD COLUMN IF NOT EXISTS ricochet_source_upload_id  uuid;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_ricochet_source_upload_id_fkey;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_ricochet_source_upload_id_fkey
  FOREIGN KEY (ricochet_source_upload_id)
  REFERENCES public.uploads(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_campaign
  ON public.leads (campaign);

-- leads already has UNIQUE (agency_id, normalized_phone) as a table-level
-- UNIQUE constraint from the initial schema migration. We check for that
-- definition and only add a named constraint if it is missing (safety net
-- for any environment where the original unique was dropped).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(agency_id, normalized_phone)%'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_agency_phone_unique
      UNIQUE (agency_id, normalized_phone);
  END IF;
END $$;

-- =========================================================
-- 2. raw_ricochet_rows
-- =========================================================
CREATE TABLE IF NOT EXISTS public.raw_ricochet_rows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id          uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  batch_id           uuid,
  agency_id          uuid NOT NULL REFERENCES public.agencies(id),
  row_number         int,
  phone_raw          text,
  normalized_phone   text,
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
CREATE INDEX IF NOT EXISTS idx_raw_ricochet_rows_normalized_phone
  ON public.raw_ricochet_rows (normalized_phone);

ALTER TABLE public.raw_ricochet_rows ENABLE ROW LEVEL SECURITY;

-- Mirrors the raw_daily_call_rows / raw_deer_dama_rows RLS shape from
-- 20260322220909_...sql: admin has FOR ALL; customers may INSERT for an
-- upload_id belonging to their agency. Raw rows contain PII so customers
-- do NOT get SELECT access.
CREATE POLICY "Admin full access to raw ricochet"
  ON public.raw_ricochet_rows FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can insert raw ricochet for their uploads"
  ON public.raw_ricochet_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND upload_id IN (
      SELECT id FROM public.uploads
      WHERE agency_id = public.get_user_agency_id(auth.uid())
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

-- Mirrors the per-agency event table shape used for call_events in
-- 20260322220909_...sql and 20260324000000_...sql: admin FOR ALL,
-- customer SELECT scoped to their agency_id, customer INSERT scoped to
-- their agency_id.
CREATE POLICY "Admin full access to lead requote events"
  ON public.lead_requote_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency lead requote events"
  ON public.lead_requote_events FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

CREATE POLICY "Customers can insert lead requote events for their agency"
  ON public.lead_requote_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- =========================================================
-- 4. uploads.report_type — add 'ricochet_lead_list'
-- =========================================================
-- VARIANT B (CHECK constraint). Existing values are
-- 'daily_call_report' and 'deer_dama_report' (see initial migration
-- 20260320184153_...sql line 34). We drop and re-add the CHECK with
-- the new value included.
ALTER TABLE public.uploads
  DROP CONSTRAINT IF EXISTS uploads_report_type_check;

ALTER TABLE public.uploads
  ADD CONSTRAINT uploads_report_type_check
  CHECK (report_type IN ('daily_call_report', 'deer_dama_report', 'ricochet_lead_list'));

COMMIT;
