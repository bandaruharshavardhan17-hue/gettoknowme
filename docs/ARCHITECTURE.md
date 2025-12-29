# Know Me - Architecture Documentation

> **Purpose**: A knowledge-based Q&A app where owners upload documents, share links, and visitors ask questions answered by AI using only the uploaded content.

> **Related Docs**: 
> - [Developer Guide](./DEVELOPER.md) - Setup, patterns, and development workflow
> - [API Documentation](./API.md) - API endpoints and usage
> - [OpenAPI Spec](./openapi.yaml) - OpenAPI 3.0 specification

---

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Code Organization](#code-organization)
4. [Database Schema](#database-schema)
5. [Edge Functions (APIs)](#edge-functions-apis)
6. [AI Integration](#ai-integration)
7. [Authentication Flow](#authentication-flow)
8. [Code Flow](#code-flow)
9. [Security Model](#security-model)
10. [File Structure](#file-structure)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         KNOW ME ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐    │
│  │   OWNER     │     │   VISITOR   │     │      ADMIN          │    │
│  │  (Auth'd)   │     │  (Public)   │     │   (Auth'd+Role)     │    │
│  └──────┬──────┘     └──────┬──────┘     └──────────┬──────────┘    │
│         │                   │                       │                │
│         ▼                   ▼                       ▼                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    REACT FRONTEND (Vite)                     │    │
│  │  • OwnerDashboard • PublicChat • SpaceDetail • AdminPanel   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   SUPABASE EDGE FUNCTIONS                    │    │
│  │  • api-spaces    • api-documents   • api-links              │    │
│  │  • api-analytics • api-admin       • public-chat            │    │
│  │  • process-document                                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐       │
│  │  SUPABASE   │     │  SUPABASE   │     │    OPENAI       │       │
│  │  DATABASE   │     │  STORAGE    │     │  Vector Store   │       │
│  │  (Postgres) │     │  (Files)    │     │  + Chat API     │       │
│  └─────────────┘     └─────────────┘     └─────────────────┘       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite + TypeScript | SPA with fast HMR |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first CSS with component library |
| **State** | TanStack Query (React Query) | Server state management & caching |
| **Routing** | React Router v6 | Client-side routing |
| **Backend** | Supabase Edge Functions (Deno) | Serverless API endpoints |
| **Database** | PostgreSQL (Supabase) | Primary data store with RLS |
| **Auth** | Supabase Auth | Email/password authentication |
| **Storage** | Supabase Storage | File storage for documents |
| **AI** | OpenAI API | GPT-4o-mini + Vector Store for RAG |
| **Validation** | Zod | Schema validation |

---

## Code Organization

The codebase follows industry-standard patterns for maintainability and scalability:

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION                               │
│  React Components (pages/, components/)                              │
│  - Handle UI rendering and user interactions                         │
│  - Use hooks for data and logic                                      │
├─────────────────────────────────────────────────────────────────────┤
│                           HOOKS LAYER                                │
│  Custom Hooks (hooks/)                                               │
│  - useDocuments, useSpace, useShareLink, useAutoSave                │
│  - Encapsulate state management and side effects                     │
├─────────────────────────────────────────────────────────────────────┤
│                          SERVICE LAYER                               │
│  API Services (services/api.ts)                                      │
│  - spacesService, documentsService, shareLinksService               │
│  - Centralized API calls with error handling                         │
├─────────────────────────────────────────────────────────────────────┤
│                           DATA LAYER                                 │
│  Supabase Client + Edge Functions                                    │
│  - Database operations, file storage, AI processing                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/types/index.ts` | All TypeScript type definitions |
| `src/constants/index.ts` | App-wide constants and configuration |
| `src/services/api.ts` | Centralized API service functions |
| `src/hooks/` | Reusable custom hooks |
| `src/contexts/` | React Context providers |

### Design Principles

1. **Single Responsibility**: Each file/function does one thing well
2. **DRY (Don't Repeat Yourself)**: Common patterns extracted to hooks/services
3. **Type Safety**: Full TypeScript with strict mode
4. **Separation of Concerns**: UI, logic, and data access are separate layers
5. **Composition over Inheritance**: Hooks compose functionality

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     profiles     │       │      spaces      │       │    documents     │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK, FK→auth) │◄──────│ owner_id (FK)    │──────►│ space_id (FK)    │
│ email            │       │ id (PK)          │       │ id (PK)          │
│ display_name     │       │ name             │       │ filename         │
│ avatar_url       │       │ description      │       │ content_text     │
│ tutorial_completed│      │ openai_vector_id │       │ file_path        │
│ created_at       │       │ created_at       │       │ file_type        │
│ updated_at       │       │ updated_at       │       │ status           │
└──────────────────┘       └────────┬─────────┘       │ openai_file_id   │
                                    │                 │ error_message    │
                                    │                 │ created_at       │
                                    ▼                 └────────┬─────────┘
                           ┌──────────────────┐                │
                           │   share_links    │                ▼
                           ├──────────────────┤       ┌──────────────────┐
                           │ id (PK)          │       │ document_chunks  │
                           │ space_id (FK)    │       ├──────────────────┤
                           │ token (unique)   │       │ id (PK)          │
                           │ name             │       │ document_id (FK) │
                           │ revoked          │       │ content          │
                           │ view_count       │       │ chunk_index      │
                           │ last_used_at     │       │ embedding        │
                           │ created_at       │       │ created_at       │
                           └────────┬─────────┘       └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐       ┌──────────────────┐
                           │  chat_messages   │       │    user_roles    │
                           ├──────────────────┤       ├──────────────────┤
                           │ id (PK)          │       │ id (PK)          │
                           │ share_link_id(FK)│       │ user_id (FK)     │
                           │ space_id (FK)    │       │ role (enum)      │
                           │ role             │       │ created_at       │
                           │ content          │       └──────────────────┘
                           │ created_at       │
                           └──────────────────┘
```

### Table Details

#### `profiles`
User profile data synced from auth on signup.
```sql
id: uuid (PK, references auth.users)
email: text
display_name: text
avatar_url: text
tutorial_completed: boolean (default: false)
created_at: timestamptz
updated_at: timestamptz
```

#### `spaces`
Knowledge containers that hold documents.
```sql
id: uuid (PK)
owner_id: uuid (FK → profiles.id)
name: text (required)
description: text (optional, used as AI fallback response)
openai_vector_store_id: text (created on first document upload)
created_at: timestamptz
updated_at: timestamptz
```

#### `documents`
Files/notes uploaded to a space.
```sql
id: uuid (PK)
space_id: uuid (FK → spaces.id)
filename: text (required)
content_text: text (extracted text content)
file_path: text (storage path for PDFs/images)
file_type: text ('pdf', 'txt', 'note', 'image')
status: enum ('uploading', 'indexing', 'ready', 'failed')
openai_file_id: text (OpenAI file reference)
error_message: text
created_at: timestamptz
updated_at: timestamptz
```

#### `document_chunks`
Text chunks for semantic search.
```sql
id: uuid (PK)
document_id: uuid (FK → documents.id)
content: text
chunk_index: integer
embedding: vector(1536) (pgvector)
created_at: timestamptz
```

#### `share_links`
Public access tokens for spaces.
```sql
id: uuid (PK)
space_id: uuid (FK → spaces.id)
token: text (unique, auto-generated hex)
name: text (optional label)
revoked: boolean (default: false)
view_count: integer (default: 0)
last_used_at: timestamptz
created_at: timestamptz
```

#### `chat_messages`
Conversation history per share link.
```sql
id: uuid (PK)
share_link_id: uuid (FK → share_links.id)
space_id: uuid (FK → spaces.id)
role: text ('user' | 'assistant')
content: text
created_at: timestamptz
```

#### `user_roles`
Admin role assignment.
```sql
id: uuid (PK)
user_id: uuid (references auth.users)
role: enum ('admin', 'user')
created_at: timestamptz
```

### Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: Creates profile on auth signup |
| `create_default_share_link()` | Trigger: Creates share link when space created |
| `has_role(user_id, role)` | Helper: Check if user has specific role |
| `match_document_chunks()` | Vector similarity search for RAG |
| `update_updated_at_column()` | Trigger: Auto-update timestamps |

### Complete SQL Schema

Below is the complete SQL to recreate the database schema:

```sql
-- =============================================================================
-- EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.document_status AS ENUM ('uploading', 'indexing', 'ready', 'failed');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Profiles (linked to Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  tutorial_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Knowledge spaces
CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,  -- AI fallback instructions
  openai_vector_store_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents (files, notes, voice transcripts)
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'pdf', 'txt', 'note', 'image'
  file_path TEXT,
  content_text TEXT,
  status document_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  openai_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document chunks for vector search
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Share links for public access
CREATE TABLE public.share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  name TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat message history
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  share_link_id UUID NOT NULL REFERENCES public.share_links(id) ON DELETE CASCADE,
  role TEXT NOT NULL,  -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_documents_space_id ON public.documents(space_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_share_links_space_id ON public.share_links(space_id);
CREATE INDEX idx_share_links_token ON public.share_links(token);
CREATE INDEX idx_chat_messages_share_link_id ON public.chat_messages(share_link_id);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create default share link when space is created
CREATE OR REPLACE FUNCTION public.create_default_share_link()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.share_links (space_id, name)
  VALUES (NEW.id, 'Default Link');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Vector similarity search for RAG
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector,
  match_threshold float,
  match_count int,
  p_space_id uuid
)
RETURNS TABLE (id uuid, document_id uuid, content text, similarity float)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT dc.id, dc.document_id, dc.content,
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

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spaces_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER on_space_created
  AFTER INSERT ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION create_default_share_link();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Spaces policies
CREATE POLICY "Owners can view their own spaces" ON public.spaces
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can create spaces" ON public.spaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their own spaces" ON public.spaces
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their own spaces" ON public.spaces
  FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Admins can view all spaces" ON public.spaces
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Documents policies
CREATE POLICY "Owners can view documents in their spaces" ON public.documents
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can create documents in their spaces" ON public.documents
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can update documents in their spaces" ON public.documents
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can delete documents in their spaces" ON public.documents
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = documents.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Admins can view all documents" ON public.documents
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Document chunks policies
CREATE POLICY "Owners can view chunks in their documents" ON public.document_chunks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.documents d
    JOIN public.spaces s ON s.id = d.space_id
    WHERE d.id = document_chunks.document_id AND s.owner_id = auth.uid()
  ));
CREATE POLICY "System can insert chunks" ON public.document_chunks
  FOR INSERT WITH CHECK (true);

-- Share links policies
CREATE POLICY "Owners can view share links for their spaces" ON public.share_links
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can create share links for their spaces" ON public.share_links
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can update share links for their spaces" ON public.share_links
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Owners can delete share links for their spaces" ON public.share_links
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = share_links.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Admins can view all share links" ON public.share_links
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Chat messages policies
CREATE POLICY "Owners can view chat messages for their spaces" ON public.chat_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.spaces WHERE spaces.id = chat_messages.space_id AND spaces.owner_id = auth.uid()
  ));
CREATE POLICY "Service role can insert chat messages" ON public.chat_messages
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view all chat messages" ON public.chat_messages
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Only admins can manage roles" ON public.user_roles
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies
CREATE POLICY "Owners can upload to documents bucket" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Owners can view their documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Owners can delete their documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## Edge Functions (APIs)

### Public API (No Auth)

#### `public-chat`
Public Q&A endpoint for visitors.

```typescript
POST /functions/v1/public-chat
Body: { token, action, message?, history? }

Actions:
- 'validate': Validate token, return space info, increment view_count
- 'chat': Send message, get AI response (streaming SSE)

Response (validate): { valid: true, space: { name, description } }
Response (chat): SSE stream with OpenAI chunks
```

### Authenticated APIs (Bearer Token)

All require `Authorization: Bearer <supabase_access_token>`

#### `api-spaces`
CRUD operations for spaces.

```typescript
GET    ?id=<uuid>           → Get single space
GET                         → List all user's spaces
POST   { name, description } → Create space
PUT    ?id=<uuid> { name }  → Update space
DELETE ?id=<uuid>           → Delete space + related data
```

#### `api-documents`
Manage documents within spaces.

```typescript
GET    ?space_id=<uuid>     → List documents in space
GET    ?id=<uuid>           → Get single document
POST   { space_id, filename, content } → Create text document
DELETE ?id=<uuid>           → Delete document + chunks
```

#### `api-links`
Manage share links.

```typescript
GET    ?space_id=<uuid>     → List links for space
GET    ?id=<uuid>           → Get single link
POST   { space_id, name }   → Create link
PUT    ?id=<uuid> { revoked, name } → Update link
DELETE ?id=<uuid>           → Delete link
```

#### `api-analytics`
View usage statistics.

```typescript
GET                         → Overall analytics (all spaces)
GET    ?space_id=<uuid>     → Space-specific analytics
GET    ?link_id=<uuid>      → Link-specific analytics

Response: { total_views, active_links, spaces[], top_links[] }
```

#### `api-admin`
Admin-only operations.

```typescript
GET    ?resource=users      → List all users
GET    ?resource=spaces     → List all spaces (all owners)
GET    ?resource=chats      → List all chat messages
GET    ?resource=analytics  → Platform-wide analytics
POST   ?action=impersonate  → Impersonate user (returns temp session)
POST   ?action=assign_role  → Assign admin role
```

### Background Processing

#### `process-document`
Processes uploaded files for AI indexing.

```typescript
POST { documentId }

Flow:
1. Get document from DB
2. Create/get vector store for space
3. Download file from storage (or use content_text for notes)
4. For images: Use GPT-4 Vision to extract text
5. Upload file to OpenAI
6. Add to vector store
7. Update document status to 'ready'
```

### Voice & Audio

#### `voice-to-text`
Transcribes audio to text using OpenAI Whisper.

```typescript
POST { audio: base64_string }
Response: { text: string }

Used by: Owner voice notes, Public chat voice input
```

#### `text-to-speech`
Generates audio from text using OpenAI TTS.

```typescript
POST { text: string, voice?: string }
Response: audio/mpeg (binary)

Voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse
Used by: Public chat "Listen" button, Auto-read feature
```

---

## AI Integration

### Vector Store Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPENAI VECTOR STORES                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Space A                    Space B                    Space C       │
│  ┌───────────────┐         ┌───────────────┐         ┌───────────┐  │
│  │ Vector Store  │         │ Vector Store  │         │   None    │  │
│  │ vs_abc123     │         │ vs_def456     │         │  (no docs)│  │
│  ├───────────────┤         ├───────────────┤         └───────────┘  │
│  │ file_1.pdf    │         │ resume.pdf    │                        │
│  │ file_2.txt    │         │ notes.txt     │                        │
│  │ note_1.txt    │         └───────────────┘                        │
│  └───────────────┘                                                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Chat Flow (RAG Pipeline)

```
User Question
      │
      ▼
┌─────────────────┐
│ 1. Validate     │ ← Check token is valid & not revoked
│    Token        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Get Context  │ ← Query OpenAI Vector Store
│    from Docs    │ ← Also fetch from document_chunks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Build System │ ← Inject document context
│    Prompt       │ ← Set "only use documents" rule
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Call GPT-4o  │ ← Stream response via SSE
│    -mini        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Save to      │ ← Store in chat_messages
│    History      │
└────────┬────────┘
         │
         ▼
   AI Response
```

### AI Models Used

| Model | Use Case | Location | Notes |
|-------|----------|----------|-------|
| `gpt-4o-mini` | Chat completions | `public-chat` | Fast, cost-effective |
| `gpt-4o-mini` (Vision) | Image text extraction | `process-document` | OCR for uploaded images |
| `whisper-1` | Voice transcription | `voice-to-text` | Audio → text |
| `tts-1` | Text-to-speech | `text-to-speech` | AI response playback |
| OpenAI Vector Store | Document embedding & search | `process-document`, `public-chat` | RAG retrieval |

### AI Configuration (Edge Function Secrets)

These secrets are configured in Supabase Edge Functions:

| Secret | Purpose | Required |
|--------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API access | Yes |
| `SUPABASE_URL` | Database access in functions | Yes |
| `SUPABASE_ANON_KEY` | Public API access | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS in functions | Yes |

### Prompt Engineering

**System Prompt Template (public-chat):**
```
You are a helpful AI assistant. Answer questions based ONLY on the following document content:

---DOCUMENTS---
{extracted_content_from_vector_store}
---END DOCUMENTS---

CRITICAL RULES:
1. Answer ONLY based on the document content above.
2. For personal questions (like "What is your experience?"), find the info in docs 
   and answer as if YOU are that person (first person: "I have...", "My experience...").
3. If the information is NOT in the documents, say: "{owner_fallback_message}"
4. Never make up information not in the documents.
5. Be concise but complete.
6. When referencing documents, be specific about where you found the information.
```

**Image Processing Prompt (process-document):**
```
Extract all text content from this image. Include:
- Any visible text, headings, paragraphs
- Text in tables, charts, or diagrams
- Labels and captions
Preserve the structure as much as possible.
```

### No Hallucination Guarantee

The system enforces strict grounding:
1. **Vector search first**: Only documents with similarity > threshold are used
2. **System prompt rules**: Explicit instruction to only use document content
3. **Fallback message**: Owner-configurable response when no answer found
4. **No context = refuse**: If vector store returns nothing → "I don't know"

---

## Authentication Flow

### Signup Flow

```
┌─────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────────┐
│  User   │───►│ Login Page   │───►│ Supabase   │───►│ handle_new_ │
│ Signup  │    │ (Form)       │    │ Auth       │    │ user()      │
└─────────┘    └──────────────┘    └────────────┘    └──────┬──────┘
                                                            │
                                         Creates profile ◄──┘
                                         with display_name
```

### Session Management

```typescript
// AuthContext.tsx
const { user, session, signIn, signUp, signOut } = useAuth();

// Access token for API calls
const token = session?.access_token;

// API call pattern
fetch('/functions/v1/api-spaces', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Role-Based Access

```typescript
// Check admin status
const { isAdmin } = useIsAdmin();  // Queries user_roles table

// Protect admin routes
<AdminRoute><AdminDashboard /></AdminRoute>

// RLS Policy example
CREATE POLICY "Admins can view all"
ON spaces FOR SELECT
USING (has_role(auth.uid(), 'admin'));
```

---

## Code Flow

### Owner Creates Space → Uploads Document → Shares

```
1. Create Space
   OwnerDashboard → SpacesTab → "New Space" dialog
   → supabase.from('spaces').insert()
   → Trigger: create_default_share_link() auto-creates link

2. Upload Document
   SpaceDetail → SpaceDocumentsTab → Upload/Note button
   → Upload to supabase.storage.from('documents')
   → Insert to documents table (status: 'uploading')
   → Call process-document edge function
   → OpenAI: Create vector store (if first doc)
   → OpenAI: Upload file & add to vector store
   → Update status to 'ready'

3. Share Link
   SpaceDetail → SpaceLinksTab → Copy link button
   → Link format: /chat/{token}
   → Share with visitors
```

### Visitor Asks Question

```
1. Access Link
   PublicChat receives token from URL
   → Call public-chat?action=validate
   → Increment view_count, return space info

2. Send Message
   Type question → Call public-chat?action=chat
   → Validate token (not revoked)
   → Search vector store for relevant chunks
   → Build context from documents
   → Stream GPT response back
   → Save both messages to chat_messages

3. Continue Conversation
   Previous messages passed as 'history'
   → Context maintained for follow-ups
```

---

## Security Model

### Row Level Security (RLS) Policies

| Table | Policy | Rule |
|-------|--------|------|
| `profiles` | View own | `auth.uid() = id` |
| `profiles` | Admin view all | `has_role(auth.uid(), 'admin')` |
| `spaces` | Owner CRUD | `auth.uid() = owner_id` |
| `spaces` | Admin view | `has_role(auth.uid(), 'admin')` |
| `documents` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `share_links` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `chat_messages` | Owner via space | `EXISTS (spaces WHERE owner_id = auth.uid())` |
| `chat_messages` | Service insert | `true` (for edge functions) |
| `user_roles` | Admin only | `has_role(auth.uid(), 'admin')` |

### Storage Policies

| Bucket | Policy |
|--------|--------|
| `documents` | Private - owner access only via RLS |
| `avatars` | Public read, owner write |

### API Security

- **Authenticated endpoints**: Validate Bearer token via `supabase.auth.getUser()`
- **Public chat**: Token-based access (no auth required)
- **Admin endpoints**: Check `has_role(userId, 'admin')` after auth
- **Service role**: Edge functions use service role key for DB operations

---

## File Structure

```
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── OnboardingTutorial.tsx # First-time user tutorial
│   │   ├── ProfileDropdown.tsx    # User menu
│   │   ├── ProtectedRoute.tsx     # Auth guard
│   │   ├── AdminRoute.tsx         # Admin guard
│   │   └── QRCodeDialog.tsx       # QR code display/share dialog
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Auth state provider
│   │   └── ImpersonationContext.tsx
│   │
│   ├── hooks/
│   │   ├── useIsAdmin.ts          # Admin role check
│   │   ├── useVoiceRecording.ts   # Voice input hook
│   │   ├── useTextToSpeech.ts     # TTS playback hook
│   │   └── use-mobile.tsx         # Responsive detection
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts              # Supabase client (auto-generated)
│   │   └── types.ts               # DB types (auto-generated)
│   │
│   ├── pages/
│   │   ├── Login.tsx              # Auth page
│   │   ├── PublicChat.tsx         # Visitor chat (voice + TTS)
│   │   ├── owner/
│   │   │   ├── OwnerDashboard.tsx # Main dashboard
│   │   │   ├── SpaceDetail.tsx    # Space view (3 tabs)
│   │   │   ├── SpacesTab.tsx      # Space list
│   │   │   ├── SpaceDocumentsTab.tsx  # Docs + chat link + QR code
│   │   │   ├── SpaceChatHistoryTab.tsx
│   │   │   ├── SpaceAnalyticsTab.tsx
│   │   │   └── ShareSpace.tsx     # Manage links + QR codes
│   │   └── admin/
│   │       ├── AdminDashboard.tsx
│   │       ├── AdminUsersTab.tsx
│   │       ├── AdminSpacesTab.tsx
│   │       └── AdminChatsTab.tsx
│   │
│   └── lib/
│       └── utils.ts               # cn() helper
│
├── supabase/
│   ├── config.toml                # Supabase config
│   ├── functions/
│   │   ├── api-spaces/index.ts
│   │   ├── api-documents/index.ts
│   │   ├── api-links/index.ts
│   │   ├── api-analytics/index.ts
│   │   ├── api-admin/index.ts
│   │   ├── public-chat/index.ts
│   │   ├── process-document/index.ts
│   │   ├── voice-to-text/index.ts   # Whisper transcription
│   │   ├── text-to-speech/index.ts  # OpenAI TTS
│   │   └── generate-content/index.ts
│   └── migrations/                # SQL migrations
│
├── docs/
│   ├── API.md                     # API documentation
│   ├── openapi.yaml               # OpenAPI spec
│   └── ARCHITECTURE.md            # This file
│
└── index.html
```

### Space Detail Tabs (Simplified)

The space detail page now has **3 tabs** (Links tab removed for simplicity):

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Documents** | `SpaceDocumentsTab` | Add knowledge, AI fallback, manage documents |
| **History** | `SpaceChatHistoryTab` | View conversation history |
| **Analytics** | `SpaceAnalyticsTab` | View usage stats |

**Key simplification**: Each space has ONE chat link, created/displayed directly in the Documents tab.

### SpaceDocumentsTab UI Structure

The Documents tab uses a tabbed interface for adding content:

| Input Tab | Purpose |
|-----------|---------|
| **Upload** | Drag/click to upload PDF, TXT, images |
| **Paste** | Paste text content with title |
| **Type** | Manually type information |
| **Voice** | Record voice, auto-transcribe via Whisper |

Additional sections:
- **AI Fallback Response**: Collapsible section for setting what AI says when no answer found
- **Documents List**: Shows all uploaded docs with View/Edit/Delete actions
  - View: Opens dialog showing content preview
  - Edit: (Notes only) Edit title and content
  - Delete: Remove document from knowledge base

### Sharing Features

#### QR Code Sharing
Share links can be distributed via QR codes for easy mobile access:

| Feature | Description |
|---------|-------------|
| **Show QR** | Display scannable QR code in modal dialog |
| **Download** | Save QR code as PNG image |
| **Share** | Native share (mobile) or copy link (desktop) |

The `QRCodeDialog` component (`src/components/QRCodeDialog.tsx`) uses `qrcode.react` library with high error correction (Level H) for reliable scanning.

---

## Quick Reference: Building Similar Apps

### 1. Setup Checklist
- [ ] Supabase project with Auth enabled
- [ ] Auto-confirm emails for development
- [ ] Storage bucket for files
- [ ] pgvector extension for embeddings
- [ ] OpenAI API key in secrets

### 2. Core Patterns to Reuse

**Auth with Profiles:**
```sql
-- Trigger on auth.users to create profile
CREATE FUNCTION handle_new_user() RETURNS trigger ...
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users ...
```

**RLS Pattern:**
```sql
-- Owner-based access
CREATE POLICY "owner_access" ON table
FOR ALL USING (auth.uid() = owner_id);

-- Admin override
CREATE POLICY "admin_access" ON table
FOR SELECT USING (has_role(auth.uid(), 'admin'));
```

**Edge Function Auth:**
```typescript
const token = req.headers.get('authorization')?.slice(7);
const { data: { user } } = await supabase.auth.getUser(token);
if (!user) return new Response('Unauthorized', { status: 401 });
```

**RAG Pipeline:**
1. Create OpenAI Vector Store per collection
2. Upload files to vector store
3. On query: search vector store + fetch chunks
4. Inject context into system prompt
5. Stream response via SSE

### 3. Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| One link per space | Auto-created | Simpler UX, fewer edge cases |
| Vector store per space | Yes | Isolated search contexts |
| Store chat history | Yes | Analytics + context for follow-ups |
| Image OCR | GPT-4 Vision | No extra service needed |
| Streaming | SSE | Real-time feel, works everywhere |

---

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `OPENAI_API_KEY` | GPT + Vector Store API calls |
| `SUPABASE_URL` | Database/auth endpoint |
| `SUPABASE_ANON_KEY` | Public client access |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function admin access |

---

*Last updated: December 2024*
