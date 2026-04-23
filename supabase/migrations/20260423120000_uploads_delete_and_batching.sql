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
