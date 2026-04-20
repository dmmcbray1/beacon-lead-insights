-- Add voicemail tracking to call_events and leads tables
-- Disposition: 1.4 CALLED - Left Voicemail (List)

ALTER TABLE call_events
  ADD COLUMN IF NOT EXISTS is_voicemail boolean DEFAULT false;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS total_voicemails integer DEFAULT 0;
