-- Sync items on new purchase order items and bill items

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.items ADD COLUMN cost_price NUMERIC DEFAULT 0;
    UPDATE public.items SET cost_price = COALESCE(cost_price, 0);
    ALTER TABLE public.items ALTER COLUMN cost_price SET NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_item_from_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE po_row RECORD;
DECLARE item_id UUID;
BEGIN
  -- Fetch the order/company
  SELECT * INTO po_row FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
  IF po_row IS NULL THEN RETURN NEW; END IF;

  IF NEW.description IS NULL OR TRIM(NEW.description) = '' THEN RETURN NEW; END IF;

  -- Ensure item exists
  INSERT INTO public.items (company_id, name, description, item_type, unit_price, cost_price, quantity_on_hand)
  SELECT po_row.company_id, TRIM(NEW.description), TRIM(NEW.description), 'product', COALESCE(NEW.unit_price,0), COALESCE(NEW.unit_price,0), 0
  WHERE NOT EXISTS (
    SELECT 1 FROM public.items i WHERE i.company_id = po_row.company_id AND LOWER(i.name) = LOWER(TRIM(NEW.description))
  );

  -- Update cost price (latest PO unit price)
  UPDATE public.items i
  SET cost_price = COALESCE(NEW.unit_price, i.cost_price)
  WHERE i.company_id = po_row.company_id AND LOWER(i.name) = LOWER(TRIM(NEW.description));

  -- If PO is sent, increase stock
  IF po_row.status = 'sent' THEN
    UPDATE public.items i
    SET quantity_on_hand = COALESCE(i.quantity_on_hand,0) + COALESCE(NEW.quantity,0)
    WHERE i.company_id = po_row.company_id AND LOWER(i.name) = LOWER(TRIM(NEW.description));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_from_po ON public.purchase_order_items;
CREATE TRIGGER trg_sync_item_from_po
AFTER INSERT ON public.purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_item_from_po();

CREATE OR REPLACE FUNCTION public.sync_item_from_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b_row RECORD;
BEGIN
  SELECT * INTO b_row FROM public.bills WHERE id = NEW.bill_id;
  IF b_row IS NULL THEN RETURN NEW; END IF;

  IF NEW.description IS NULL OR TRIM(NEW.description) = '' THEN RETURN NEW; END IF;

  -- Ensure item exists
  INSERT INTO public.items (company_id, name, description, item_type, unit_price, cost_price, quantity_on_hand)
  SELECT b_row.company_id, TRIM(NEW.description), TRIM(NEW.description), 'product', COALESCE(NEW.unit_price,0), COALESCE(NEW.unit_price,0), 0
  WHERE NOT EXISTS (
    SELECT 1 FROM public.items i WHERE i.company_id = b_row.company_id AND LOWER(i.name) = LOWER(TRIM(NEW.description))
  );

  -- Increase stock and update cost price from bill
  UPDATE public.items i
  SET quantity_on_hand = COALESCE(i.quantity_on_hand,0) + COALESCE(NEW.quantity,0),
      cost_price = COALESCE(NEW.unit_price, i.cost_price)
  WHERE i.company_id = b_row.company_id AND LOWER(i.name) = LOWER(TRIM(NEW.description));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_from_bill ON public.bill_items;
CREATE TRIGGER trg_sync_item_from_bill
AFTER INSERT ON public.bill_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_item_from_bill();
