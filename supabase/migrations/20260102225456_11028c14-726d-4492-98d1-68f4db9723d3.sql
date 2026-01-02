-- Add expires_at column to share_links
ALTER TABLE public.share_links
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;