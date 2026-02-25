-- Add VAT and Tax Deductible columns to chart_of_accounts
ALTER TABLE "public"."chart_of_accounts" 
ADD COLUMN "is_vat_applicable" boolean DEFAULT false,
ADD COLUMN "is_tax_deductible" boolean DEFAULT false;
