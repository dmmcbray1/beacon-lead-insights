
ALTER TABLE public.disposition_mappings DROP CONSTRAINT disposition_mappings_category_check;
ALTER TABLE public.disposition_mappings ADD CONSTRAINT disposition_mappings_category_check CHECK (category = ANY (ARRAY['contact','quote','bad_phone','not_contacted','sold','other']));
ALTER TABLE public.disposition_mappings DROP CONSTRAINT disposition_mappings_status_value_key;
