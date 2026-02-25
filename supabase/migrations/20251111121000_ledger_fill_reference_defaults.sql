-- Fill missing ledger_entries fields on insert to avoid NOT NULL violations
-- Ensures reference_id is never null; sets sensible defaults for entry_type and posted_by

CREATE OR REPLACE FUNCTION public.fill_ledger_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure reference_id is set; default to TXN-<transaction_id>
  IF NEW.reference_id IS NULL OR NEW.reference_id = '' THEN
    IF NEW.transaction_id IS NULL THEN
      RAISE EXCEPTION 'transaction_id is required to derive reference_id';
    END IF;
    NEW.reference_id := 'TXN-' || NEW.transaction_id::text;
  END IF;

  -- Ensure entry_type has a value (table default is 'standard')
  IF NEW.entry_type IS NULL OR NEW.entry_type = '' THEN
    NEW.entry_type := 'standard';
  END IF;

  -- Fill posted_by with the current user if not provided
  IF NEW.posted_by IS NULL THEN
    NEW.posted_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- Create BEFORE INSERT trigger to apply defaults
DROP TRIGGER IF EXISTS trigger_fill_ledger_defaults ON public.ledger_entries;
CREATE TRIGGER trigger_fill_ledger_defaults
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_ledger_defaults();