-- Add usage tracking columns to share_links
ALTER TABLE public.share_links 
ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_share_links_view_count ON public.share_links(view_count DESC);