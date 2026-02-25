-- Add advanced fiscal settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS fiscal_default_year integer,
  ADD COLUMN IF NOT EXISTS fiscal_lock_year boolean DEFAULT false;

-- Optional: ensure updated_at exists for tracking
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Create an index to speed up lookups by company
CREATE INDEX IF NOT EXISTS app_settings_company_id_idx ON public.app_settings (company_id);

