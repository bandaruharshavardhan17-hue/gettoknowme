-- Enable pgvector extension for embeddings FIRST
CREATE EXTENSION IF NOT EXISTS vector;

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create spaces table
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on spaces
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- Spaces RLS policies
CREATE POLICY "Owners can view their own spaces"
  ON public.spaces FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can create spaces"
  ON public.spaces FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own spaces"
  ON public.spaces FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their own spaces"
  ON public.spaces FOR DELETE
  USING (auth.uid() = owner_id);

-- Create document status enum
CREATE TYPE public.document_status AS ENUM ('uploading', 'indexing', 'ready', 'failed');

-- Create documents table
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content_text TEXT,
  file_path TEXT,
  status public.document_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Documents RLS policies
CREATE POLICY "Owners can view documents in their spaces"
  ON public.documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can create documents in their spaces"
  ON public.documents FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can update documents in their spaces"
  ON public.documents FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can delete documents in their spaces"
  ON public.documents FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()));

-- Create document chunks table for RAG
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on document_chunks
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view chunks in their documents"
  ON public.document_chunks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.documents d JOIN public.spaces s ON s.id = d.space_id WHERE d.id = document_chunks.document_id AND s.owner_id = auth.uid()));

CREATE POLICY "System can insert chunks"
  ON public.document_chunks FOR INSERT
  WITH CHECK (true);

-- Create share_links table
CREATE TABLE public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on share_links
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view share links for their spaces"
  ON public.share_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can create share links for their spaces"
  ON public.share_links FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can update share links for their spaces"
  ON public.share_links FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()));

CREATE POLICY "Owners can delete share links for their spaces"
  ON public.share_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload to their spaces"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own documents"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to match document chunks by embedding similarity
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_space_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE d.space_id = p_space_id
    AND d.status = 'ready'
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;