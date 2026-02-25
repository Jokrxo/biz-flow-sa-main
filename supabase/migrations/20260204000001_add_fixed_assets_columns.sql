ALTER TABLE fixed_assets
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS serial_number text,
ADD COLUMN IF NOT EXISTS bought_from text;
