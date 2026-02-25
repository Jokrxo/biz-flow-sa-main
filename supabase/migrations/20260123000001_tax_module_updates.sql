-- Add Tax Module specific columns

-- 1. Enhance Fixed Assets for Tax
ALTER TABLE "public"."fixed_assets"
ADD COLUMN "asset_type" text DEFAULT 'Other',
ADD COLUMN "wear_and_tear_rate" numeric(5,2) DEFAULT 0,
ADD COLUMN "tax_usage_start_date" date;

-- 2. Enhance Chart of Accounts for Exempt Income
ALTER TABLE "public"."chart_of_accounts"
ADD COLUMN "is_exempt_income" boolean DEFAULT false;

-- 3. Create a helper function to auto-assign asset types based on description (optional, but helpful)
CREATE OR REPLACE FUNCTION classify_asset_type() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.asset_type = 'Other' OR NEW.asset_type IS NULL THEN
        IF NEW.description ILIKE '%computer%' OR NEW.description ILIKE '%laptop%' OR NEW.description ILIKE '%software%' THEN
            NEW.asset_type := 'Computer Equipment';
            NEW.wear_and_tear_rate := 33.33;
        ELSIF NEW.description ILIKE '%vehicle%' OR NEW.description ILIKE '%car%' OR NEW.description ILIKE '%bakkie%' THEN
            NEW.asset_type := 'Motor Vehicles';
            NEW.wear_and_tear_rate := 20.00;
        ELSIF NEW.description ILIKE '%furniture%' OR NEW.description ILIKE '%desk%' OR NEW.description ILIKE '%chair%' THEN
            NEW.asset_type := 'Furniture & Fixtures';
            NEW.wear_and_tear_rate := 16.67;
        ELSIF NEW.description ILIKE '%machine%' OR NEW.description ILIKE '%plant%' THEN
            NEW.asset_type := 'Plant & Machinery';
            NEW.wear_and_tear_rate := 20.00; -- Default, varies
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_asset_type_trigger
BEFORE INSERT ON "public"."fixed_assets"
FOR EACH ROW
EXECUTE FUNCTION classify_asset_type();
