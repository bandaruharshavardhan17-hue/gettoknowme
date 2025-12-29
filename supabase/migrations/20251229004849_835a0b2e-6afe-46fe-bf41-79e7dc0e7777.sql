-- Add ai_model column to chat_messages to track which model was used
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS ai_model TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.chat_messages.ai_model IS 'The OpenAI model used for generating the response (only set for assistant messages)';