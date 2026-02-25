-- Add cost_price to items and backfill from unit_price
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.items ADD COLUMN cost_price NUMERIC;
    UPDATE public.items SET cost_price = COALESCE(cost_price, unit_price);
    ALTER TABLE public.items ALTER COLUMN cost_price SET DEFAULT 0;
    ALTER TABLE public.items ALTER COLUMN cost_price SET NOT NULL;
  END IF;
END $$;