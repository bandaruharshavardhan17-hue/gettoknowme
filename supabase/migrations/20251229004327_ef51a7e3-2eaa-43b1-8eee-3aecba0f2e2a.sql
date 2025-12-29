-- Add AI model column to spaces table
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gpt-4o-mini';

-- Add comment for documentation
COMMENT ON COLUMN public.spaces.ai_model IS 'OpenAI model to use for chat: gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo';