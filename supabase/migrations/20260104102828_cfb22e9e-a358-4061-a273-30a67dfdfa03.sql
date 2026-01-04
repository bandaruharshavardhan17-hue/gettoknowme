-- Deny anonymous users from selecting profiles
CREATE POLICY "Deny anonymous access to profiles" 
ON public.profiles 
FOR SELECT 
TO anon 
USING (false);