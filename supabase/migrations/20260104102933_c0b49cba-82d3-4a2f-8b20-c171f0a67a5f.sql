-- Deny anonymous users from selecting share_links (protects secret tokens)
CREATE POLICY "Deny anonymous access to share_links" 
ON public.share_links 
FOR SELECT 
TO anon 
USING (false);