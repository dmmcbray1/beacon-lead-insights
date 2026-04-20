-- Allow approved customers to write leads and related tables during CSV imports.
-- Previously these tables were admin-only INSERT/UPDATE; customers could only SELECT.

-- ─── LEADS ────────────────────────────────────────────────────────────────────

CREATE POLICY "Customers can insert leads for their agency"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

CREATE POLICY "Customers can update leads for their agency"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  )
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- ─── CALL_EVENTS ──────────────────────────────────────────────────────────────

CREATE POLICY "Customers can insert call events for their agency"
  ON public.call_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- ─── STATUS_EVENTS ────────────────────────────────────────────────────────────

CREATE POLICY "Customers can insert status events for their leads"
  ON public.status_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads
      WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

-- ─── STAFF_MEMBERS ────────────────────────────────────────────────────────────
-- Customers need to create staff entries on first import for agents not yet in DB.

CREATE POLICY "Customers can insert staff for their agency"
  ON public.staff_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- ─── LEAD_STAFF_HISTORY ───────────────────────────────────────────────────────

CREATE POLICY "Customers can read staff history for their agency leads"
  ON public.lead_staff_history FOR SELECT
  TO authenticated
  USING (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads
      WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );

CREATE POLICY "Customers can insert staff history for their leads"
  ON public.lead_staff_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_approval_status(auth.uid()) = 'approved'
    AND lead_id IN (
      SELECT id FROM public.leads
      WHERE agency_id = public.get_user_agency_id(auth.uid())
    )
  );
