
-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

-- 2. User roles table (per security guidelines)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. User profiles table for approval workflow & agency assignment
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email text NOT NULL,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  approval_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 4. Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Security definer function to get user's agency
CREATE OR REPLACE FUNCTION public.get_user_agency_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id FROM public.user_profiles
  WHERE user_id = _user_id AND approval_status = 'approved'
  LIMIT 1
$$;

-- 6. Security definer to check approval status
CREATE OR REPLACE FUNCTION public.get_user_approval_status(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT approval_status FROM public.user_profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 7. Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. RLS on user_roles: admins can manage, users can read their own
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. RLS on user_profiles: users read own, admins manage all
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 10. Update data table RLS: admin sees all, customers see only their agency
-- Drop existing permissive policies and replace with scoped ones

-- LEADS table
DROP POLICY IF EXISTS "Anyone can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can read leads" ON public.leads;

CREATE POLICY "Admin full access to leads"
  ON public.leads FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- CALL_EVENTS table
DROP POLICY IF EXISTS "Anyone can manage call events" ON public.call_events;

CREATE POLICY "Admin full access to call events"
  ON public.call_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency call events"
  ON public.call_events FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- UPLOADS table
DROP POLICY IF EXISTS "Anyone can create uploads" ON public.uploads;
DROP POLICY IF EXISTS "Anyone can read uploads" ON public.uploads;
DROP POLICY IF EXISTS "Anyone can update uploads" ON public.uploads;

CREATE POLICY "Admin full access to uploads"
  ON public.uploads FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency uploads"
  ON public.uploads FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

CREATE POLICY "Customers can create own agency uploads"
  ON public.uploads FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- QUOTE_EVENTS table
DROP POLICY IF EXISTS "Anyone can manage quote events" ON public.quote_events;

CREATE POLICY "Admin full access to quote events"
  ON public.quote_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency quote events"
  ON public.quote_events FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

-- CALLBACK_EVENTS table
DROP POLICY IF EXISTS "Anyone can manage callback events" ON public.callback_events;

CREATE POLICY "Admin full access to callback events"
  ON public.callback_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency callback events"
  ON public.callback_events FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

-- STATUS_EVENTS table
DROP POLICY IF EXISTS "Anyone can manage status events" ON public.status_events;

CREATE POLICY "Admin full access to status events"
  ON public.status_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency status events"
  ON public.status_events FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

-- RAW tables: admin only (contain PII)
DROP POLICY IF EXISTS "Anyone can insert raw daily" ON public.raw_daily_call_rows;
DROP POLICY IF EXISTS "Anyone can read raw daily" ON public.raw_daily_call_rows;
DROP POLICY IF EXISTS "Anyone can update raw daily" ON public.raw_daily_call_rows;

CREATE POLICY "Admin full access to raw daily"
  ON public.raw_daily_call_rows FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Customers can insert raw daily rows (for upload) via upload_id matching their agency
CREATE POLICY "Customers can insert raw daily for their uploads"
  ON public.raw_daily_call_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND upload_id IN (
      SELECT id FROM public.uploads WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone can insert raw deer dama" ON public.raw_deer_dama_rows;
DROP POLICY IF EXISTS "Anyone can read raw deer dama" ON public.raw_deer_dama_rows;
DROP POLICY IF EXISTS "Anyone can update raw deer dama" ON public.raw_deer_dama_rows;

CREATE POLICY "Admin full access to raw deer dama"
  ON public.raw_deer_dama_rows FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can insert raw deer dama for their uploads"
  ON public.raw_deer_dama_rows FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND upload_id IN (
      SELECT id FROM public.uploads WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

-- AGENCIES table: keep readable for approved customers (for dropdown filters)
DROP POLICY IF EXISTS "Anyone can manage agencies" ON public.agencies;
DROP POLICY IF EXISTS "Anyone can read agencies" ON public.agencies;

CREATE POLICY "Admin full access to agencies"
  ON public.agencies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency"
  ON public.agencies FOR SELECT
  TO authenticated
  USING (id = public.get_user_agency_id(auth.uid()));

-- STAFF_MEMBERS table
DROP POLICY IF EXISTS "Anyone can manage staff" ON public.staff_members;
DROP POLICY IF EXISTS "Anyone can read staff" ON public.staff_members;

CREATE POLICY "Admin full access to staff"
  ON public.staff_members FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers read own agency staff"
  ON public.staff_members FOR SELECT
  TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

-- Admin-only tables
DROP POLICY IF EXISTS "Anyone can manage dispositions" ON public.disposition_mappings;
CREATE POLICY "Admin full access to dispositions"
  ON public.disposition_mappings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage call type mappings" ON public.call_type_mappings;
CREATE POLICY "Admin full access to call type mappings"
  ON public.call_type_mappings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage templates" ON public.upload_templates;
CREATE POLICY "Admin full access to templates"
  ON public.upload_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage audit log" ON public.match_audit_log;
CREATE POLICY "Admin full access to audit log"
  ON public.match_audit_log FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage identity links" ON public.lead_identity_links;
CREATE POLICY "Admin full access to identity links"
  ON public.lead_identity_links FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage staff history" ON public.lead_staff_history;
CREATE POLICY "Admin full access to staff history"
  ON public.lead_staff_history FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can manage import errors" ON public.import_errors;
CREATE POLICY "Admin full access to import errors"
  ON public.import_errors FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
