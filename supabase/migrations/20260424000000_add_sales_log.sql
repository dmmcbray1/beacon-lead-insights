-- ============================================================
-- Sales Log migration
-- ============================================================

-- sales_events table: one row per policy line per sale
CREATE TABLE IF NOT EXISTS public.sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  upload_id UUID REFERENCES public.uploads(id) ON DELETE SET NULL,
  sale_id TEXT NOT NULL,          -- the UUID from Sale ID column (groups policies per household)
  sale_date DATE,
  customer_name TEXT,
  customer_phone TEXT,
  normalized_phone TEXT,
  customer_email TEXT,
  customer_zip TEXT,
  lead_source TEXT,
  producer TEXT,
  staff_id UUID REFERENCES public.staff_members(id),
  policy_type TEXT,
  policy_number TEXT,
  effective_date DATE,
  items INTEGER DEFAULT 1,
  premium NUMERIC,
  points INTEGER,
  line_items TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage sales events" ON public.sales_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sales_events_agency ON public.sales_events(agency_id);
CREATE INDEX IF NOT EXISTS idx_sales_events_lead ON public.sales_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_events_sale_id ON public.sales_events(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_events_sale_date ON public.sales_events(sale_date);

-- Update the uploads.report_type CHECK to include 'sales_log'
ALTER TABLE public.uploads DROP CONSTRAINT IF EXISTS uploads_report_type_check;
ALTER TABLE public.uploads ADD CONSTRAINT uploads_report_type_check
  CHECK (report_type IN ('daily_call_report', 'deer_dama_report', 'ricochet_lead_list', 'sales_log'));

-- Add new columns to leads for sales tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_sold_date DATE,
  ADD COLUMN IF NOT EXISTS total_items_sold INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_policies_sold INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_premium NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_at_first_sold INTEGER;
