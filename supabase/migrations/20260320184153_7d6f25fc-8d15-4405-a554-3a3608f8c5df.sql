
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read agencies" ON public.agencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can manage agencies" ON public.agencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, agency_id)
);
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read staff" ON public.staff_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can manage staff" ON public.staff_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily_call_report', 'deer_dama_report')),
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  upload_date DATE NOT NULL,
  notes TEXT,
  row_count INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read uploads" ON public.uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can create uploads" ON public.uploads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update uploads" ON public.uploads FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.upload_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  column_mapping JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.upload_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage templates" ON public.upload_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.raw_daily_call_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  row_number INTEGER,
  raw_data JSONB NOT NULL,
  date TIMESTAMPTZ,
  full_name TEXT,
  user_name TEXT,
  from_number TEXT,
  to_number TEXT,
  call_duration TEXT,
  call_duration_seconds INTEGER,
  current_status TEXT,
  call_type TEXT,
  call_status TEXT,
  vendor_name TEXT,
  team TEXT,
  raw_phone TEXT,
  normalized_phone TEXT,
  resolved_lead_phone TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'matched', 'unmatched', 'error', 'suppressed_duplicate')),
  match_rule TEXT,
  matched_lead_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_daily_call_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read raw daily" ON public.raw_daily_call_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert raw daily" ON public.raw_daily_call_rows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update raw daily" ON public.raw_daily_call_rows FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.raw_deer_dama_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  row_number INTEGER,
  raw_data JSONB NOT NULL,
  lead_id_external TEXT,
  full_name TEXT,
  lead_main_state TEXT,
  lead_status TEXT,
  lead_owner TEXT,
  created_at_source TIMESTAMPTZ,
  vendor TEXT,
  last_status_date TIMESTAMPTZ,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone_main TEXT,
  address TEXT,
  second_driver_first TEXT,
  second_driver_last TEXT,
  first_call_date TIMESTAMPTZ,
  last_call_date TIMESTAMPTZ,
  total_calls INTEGER,
  raw_phone TEXT,
  normalized_phone TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'matched', 'unmatched', 'error')),
  match_rule TEXT,
  matched_lead_id UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_deer_dama_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read raw deer dama" ON public.raw_deer_dama_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert raw deer dama" ON public.raw_deer_dama_rows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update raw deer dama" ON public.raw_deer_dama_rows FOR UPDATE TO authenticated USING (true);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  normalized_phone TEXT NOT NULL,
  raw_phone TEXT,
  lead_id_external TEXT,
  current_status TEXT,
  current_lead_type TEXT CHECK (current_lead_type IN ('new_lead', 're_quote')),
  latest_vendor_name TEXT,
  first_seen_date TIMESTAMPTZ,
  first_deer_dama_date TIMESTAMPTZ,
  first_daily_call_date TIMESTAMPTZ,
  first_contact_date TIMESTAMPTZ,
  first_callback_date TIMESTAMPTZ,
  first_quote_date TIMESTAMPTZ,
  latest_call_date TIMESTAMPTZ,
  latest_contact_date TIMESTAMPTZ,
  latest_callback_date TIMESTAMPTZ,
  latest_quote_date TIMESTAMPTZ,
  total_call_attempts INTEGER DEFAULT 0,
  total_callbacks INTEGER DEFAULT 0,
  has_bad_phone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agency_id, normalized_phone)
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read leads" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can manage leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_leads_agency_phone ON public.leads(agency_id, normalized_phone);
CREATE INDEX idx_leads_external_id ON public.leads(lead_id_external);

CREATE TABLE public.lead_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('lead_id', 'phone')),
  identity_value TEXT NOT NULL,
  source_upload_id UUID REFERENCES public.uploads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_identity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage identity links" ON public.lead_identity_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.lead_staff_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff_members(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('daily_call', 'deer_dama')),
  source_upload_id UUID REFERENCES public.uploads(id),
  first_seen_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_staff_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage staff history" ON public.lead_staff_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  staff_id UUID REFERENCES public.staff_members(id),
  call_date TIMESTAMPTZ,
  call_type TEXT,
  call_direction TEXT CHECK (call_direction IN ('inbound', 'outbound')),
  current_status TEXT,
  call_status TEXT,
  call_duration_seconds INTEGER,
  vendor_name TEXT,
  is_contact BOOLEAN DEFAULT false,
  is_quote BOOLEAN DEFAULT false,
  is_callback BOOLEAN DEFAULT false,
  is_bad_phone BOOLEAN DEFAULT false,
  source_raw_row_id UUID,
  source_upload_id UUID REFERENCES public.uploads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage call events" ON public.call_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_call_events_lead ON public.call_events(lead_id);
CREATE INDEX idx_call_events_date ON public.call_events(call_date);

CREATE TABLE public.status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  lead_type TEXT,
  source_type TEXT NOT NULL,
  source_upload_id UUID REFERENCES public.uploads(id),
  event_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage status events" ON public.status_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.quote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff_members(id),
  quote_date TIMESTAMPTZ NOT NULL,
  quote_status TEXT NOT NULL,
  source_upload_id UUID REFERENCES public.uploads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage quote events" ON public.quote_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.callback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff_members(id),
  callback_date TIMESTAMPTZ NOT NULL,
  call_type TEXT NOT NULL,
  source_upload_id UUID REFERENCES public.uploads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.callback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage callback events" ON public.callback_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.match_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id),
  raw_row_id UUID NOT NULL,
  raw_table TEXT NOT NULL,
  match_rule TEXT NOT NULL,
  matched_lead_id UUID REFERENCES public.leads(id),
  lead_id_used TEXT,
  phone_used TEXT,
  agency_id UUID REFERENCES public.agencies(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.match_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage audit log" ON public.match_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.uploads(id),
  row_number INTEGER,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage import errors" ON public.import_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.disposition_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_value TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('contact', 'quote', 'bad_phone', 'not_contacted', 'other')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.disposition_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage dispositions" ON public.disposition_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.call_type_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type_value TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  is_callback_type BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_type_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage call type mappings" ON public.call_type_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.agencies (name) VALUES ('McBrayer Agency');

INSERT INTO public.disposition_mappings (status_value, category) VALUES
  ('2.1 CONTACTED - Not Interested', 'contact'),
  ('2.2 CONTACTED - FOLLOW UP', 'contact'),
  ('3.0 QUOTED', 'quote'),
  ('3.1 QUOTED - HOT!!!!', 'quote'),
  ('3.2 X DATE TASK SET', 'quote'),
  ('4.0 SOLD', 'quote'),
  ('1.1 CALLED BAD PHONE #', 'bad_phone');

INSERT INTO public.call_type_mappings (call_type_value, direction, is_callback_type) VALUES
  ('Outbound Call', 'outbound', false),
  ('Inbound Call', 'inbound', true),
  ('Inbound IVR', 'inbound', true);
