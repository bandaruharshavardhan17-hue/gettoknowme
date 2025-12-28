-- Create chat_messages table to track visitor conversations
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_chat_messages_share_link_id ON public.chat_messages(share_link_id);
CREATE INDEX idx_chat_messages_space_id ON public.chat_messages(space_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Owners can view chat messages for their spaces
CREATE POLICY "Owners can view chat messages for their spaces"
ON public.chat_messages
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM spaces
  WHERE spaces.id = chat_messages.space_id
  AND spaces.owner_id = auth.uid()
));

-- Public insert policy for edge function (uses service role)
CREATE POLICY "Service role can insert chat messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (true);