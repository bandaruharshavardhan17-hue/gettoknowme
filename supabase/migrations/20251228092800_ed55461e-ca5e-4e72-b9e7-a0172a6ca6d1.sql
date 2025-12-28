-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to spaces table for admins to view all
CREATE POLICY "Admins can view all spaces"
ON public.spaces
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to profiles table for admins to view all
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to documents table for admins to view all
CREATE POLICY "Admins can view all documents"
ON public.documents
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to share_links table for admins to view all
CREATE POLICY "Admins can view all share links"
ON public.share_links
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Add admin policies to chat_messages table for admins to view all
CREATE POLICY "Admins can view all chat messages"
ON public.chat_messages
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));