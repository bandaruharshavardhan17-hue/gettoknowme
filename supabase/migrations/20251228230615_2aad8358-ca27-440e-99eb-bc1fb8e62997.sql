-- Add tutorial_completed flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tutorial_completed boolean NOT NULL DEFAULT false;

-- Mark all existing users as having completed the tutorial (they're old users)
UPDATE public.profiles SET tutorial_completed = true WHERE tutorial_completed = false;