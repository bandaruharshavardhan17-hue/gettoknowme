-- Add OpenAI vector store ID to spaces table
ALTER TABLE public.spaces ADD COLUMN openai_vector_store_id TEXT;

-- Add OpenAI file ID to documents table for tracking uploaded files
ALTER TABLE public.documents ADD COLUMN openai_file_id TEXT;