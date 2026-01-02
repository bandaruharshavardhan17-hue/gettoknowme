-- Create a table to collect user feedback/issues
CREATE TABLE IF NOT EXISTS public.issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  context text NOT NULL,        -- e.g. "feedback", "documents_error"
  message text NOT NULL,        -- user's message
  screen text,                  -- screen where it happened
  device_model text,
  system_version text,
  app_version text,
  build_number text,
  is_offline boolean DEFAULT false,
  resolved boolean DEFAULT false, -- admin can mark done
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Speed up admin list loading by newest
CREATE INDEX IF NOT EXISTS issue_reports_created_at_idx
ON public.issue_reports (created_at DESC);

-- Turn on Row Level Security
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (even without auth) can submit a report
CREATE POLICY "Anyone can submit issue reports"
ON public.issue_reports
FOR INSERT
WITH CHECK (true);

-- Only admins can view reports (uses existing has_role function)
CREATE POLICY "Admins can view issue reports"
ON public.issue_reports
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to mark reports as resolved
CREATE POLICY "Admins can update issue reports"
ON public.issue_reports
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));