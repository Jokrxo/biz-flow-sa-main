-- Add terms_accepted_at to profiles (nullable timestamp)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE NULL;
