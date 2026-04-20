-- Duplicate-import detection: track a SHA-256 hash of each uploaded file,
-- unique per agency, so re-importing the same file can be caught before it
-- doubles up call_events / leads counts.

ALTER TABLE public.uploads
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Partial unique index — only enforced when file_hash is set. When the user
-- confirms an override ("import anyway"), the client inserts with NULL so the
-- constraint does not block the re-import.
CREATE UNIQUE INDEX IF NOT EXISTS uploads_agency_hash_unique
  ON public.uploads (agency_id, file_hash)
  WHERE file_hash IS NOT NULL;
