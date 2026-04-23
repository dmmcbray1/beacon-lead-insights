-- 1. Cascade derived rows when an upload is deleted.
--    Six tables reference uploads(id) without ON DELETE CASCADE today.
--    Drop and re-add each FK with cascade so deleting an upload wipes its
--    stats rows automatically.

ALTER TABLE public.lead_identity_links
  DROP CONSTRAINT IF EXISTS lead_identity_links_source_upload_id_fkey,
  ADD CONSTRAINT lead_identity_links_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.lead_staff_history
  DROP CONSTRAINT IF EXISTS lead_staff_history_source_upload_id_fkey,
  ADD CONSTRAINT lead_staff_history_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.call_events
  DROP CONSTRAINT IF EXISTS call_events_source_upload_id_fkey,
  ADD CONSTRAINT call_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.status_events
  DROP CONSTRAINT IF EXISTS status_events_source_upload_id_fkey,
  ADD CONSTRAINT status_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.quote_events
  DROP CONSTRAINT IF EXISTS quote_events_source_upload_id_fkey,
  ADD CONSTRAINT quote_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.callback_events
  DROP CONSTRAINT IF EXISTS callback_events_source_upload_id_fkey,
  ADD CONSTRAINT callback_events_source_upload_id_fkey
    FOREIGN KEY (source_upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.match_audit_log
  DROP CONSTRAINT IF EXISTS match_audit_log_upload_id_fkey,
  ADD CONSTRAINT match_audit_log_upload_id_fkey
    FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

ALTER TABLE public.import_errors
  DROP CONSTRAINT IF EXISTS import_errors_upload_id_fkey,
  ADD CONSTRAINT import_errors_upload_id_fkey
    FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;

-- 2. Batch column — links the two uploads of a paired import.
ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS uploads_agency_batch_idx
  ON public.uploads (agency_id, batch_id)
  WHERE batch_id IS NOT NULL;

-- 3. Admin DELETE is already granted by the existing "Admin full access to
--    uploads" FOR ALL policy (see migration 20260322220909). No additional
--    policy is required — non-admins have no DELETE policy and are blocked.
