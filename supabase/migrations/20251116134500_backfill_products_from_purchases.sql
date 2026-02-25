-- Backfill products in items table from existing Purchase Orders and Bills
DO $$
DECLARE c RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.items ADD COLUMN cost_price NUMERIC DEFAULT 0;
    UPDATE public.items SET cost_price = COALESCE(cost_price, 0);
    ALTER TABLE public.items ALTER COLUMN cost_price SET NOT NULL;
  END IF;
  FOR c IN SELECT id FROM public.companies LOOP
    -- Insert missing products from Purchase Orders
    INSERT INTO public.items (company_id, name, description, item_type, unit_price, cost_price, quantity_on_hand)
    SELECT po.company_id,
           TRIM(poi.description) AS name,
           TRIM(poi.description) AS description,
           'product'::text AS item_type,
           COALESCE(poi.unit_price, 0) AS unit_price,
           COALESCE(poi.unit_price, 0) AS cost_price,
           0 AS quantity_on_hand
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    LEFT JOIN public.items i ON i.company_id = po.company_id AND LOWER(i.name) = LOWER(TRIM(poi.description))
    WHERE po.company_id = c.id
      AND i.id IS NULL
      AND poi.description IS NOT NULL AND TRIM(poi.description) <> '';

    -- Insert missing products from Bills
    INSERT INTO public.items (company_id, name, description, item_type, unit_price, cost_price, quantity_on_hand)
    SELECT b.company_id,
           TRIM(bi.description) AS name,
           TRIM(bi.description) AS description,
           'product'::text AS item_type,
           COALESCE(bi.unit_price, 0) AS unit_price,
           COALESCE(bi.unit_price, 0) AS cost_price,
           0 AS quantity_on_hand
    FROM public.bill_items bi
    JOIN public.bills b ON b.id = bi.bill_id
    LEFT JOIN public.items i ON i.company_id = b.company_id AND LOWER(i.name) = LOWER(TRIM(bi.description))
    WHERE b.company_id = c.id
      AND i.id IS NULL
      AND bi.description IS NOT NULL AND TRIM(bi.description) <> '';

    -- Update stock and cost using Bills (supplier invoices considered stock arrival)
    UPDATE public.items i SET
      quantity_on_hand = COALESCE(i.quantity_on_hand, 0) + COALESCE((
        SELECT SUM(bi.quantity)
        FROM public.bill_items bi
        JOIN public.bills b ON b.id = bi.bill_id
        WHERE b.company_id = i.company_id
          AND LOWER(TRIM(bi.description)) = LOWER(TRIM(i.name))
      ), 0),
      cost_price = COALESCE((
        SELECT bi.unit_price
        FROM public.bill_items bi
        JOIN public.bills b ON b.id = bi.bill_id
        WHERE b.company_id = i.company_id
          AND LOWER(TRIM(bi.description)) = LOWER(TRIM(i.name))
        ORDER BY b.bill_date DESC NULLS LAST
        LIMIT 1
      ), i.cost_price)
    WHERE i.company_id = c.id;

    -- Also update stock using Purchase Orders marked as 'sent' (optional)
    UPDATE public.items i SET
      quantity_on_hand = COALESCE(i.quantity_on_hand, 0) + COALESCE((
        SELECT SUM(poi.quantity)
        FROM public.purchase_order_items poi
        JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
        WHERE po.company_id = i.company_id
          AND po.status = 'sent'
          AND LOWER(TRIM(poi.description)) = LOWER(TRIM(i.name))
      ), 0)
    WHERE i.company_id = c.id;
  END LOOP;
END $$;