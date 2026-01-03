-- Add persona/AI settings to spaces
ALTER TABLE public.spaces
ADD COLUMN IF NOT EXISTS ai_fallback_message text,
ADD COLUMN IF NOT EXISTS ai_persona_style text,
ADD COLUMN IF NOT EXISTS ai_tone text,
ADD COLUMN IF NOT EXISTS ai_audience text,
ADD COLUMN IF NOT EXISTS ai_do_not_mention text,
ADD COLUMN IF NOT EXISTS space_type text;

-- Add summary/entity columns to spaces
ALTER TABLE public.spaces
ADD COLUMN IF NOT EXISTS space_summary text,
ADD COLUMN IF NOT EXISTS entity_index jsonb,
ADD COLUMN IF NOT EXISTS timeline jsonb;

-- Add scrape metadata columns to documents
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS source_url text,
ADD COLUMN IF NOT EXISTS page_title text,
ADD COLUMN IF NOT EXISTS page_excerpt text,
ADD COLUMN IF NOT EXISTS page_thumbnail_url text,
ADD COLUMN IF NOT EXISTS page_domain text,
ADD COLUMN IF NOT EXISTS extraction_quality text,
ADD COLUMN IF NOT EXISTS ocr_confidence numeric,
ADD COLUMN IF NOT EXISTS text_length integer,
ADD COLUMN IF NOT EXISTS is_image_only boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS extraction_warnings jsonb;

-- Add visibility column to documents
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';

-- Add comment for visibility values
COMMENT ON COLUMN public.documents.visibility IS 'Values: public | owner_only | internal';