-- Create table for manual tax adjustments
CREATE TABLE IF NOT EXISTS "public"."tax_adjustments" (
    "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "company_id" uuid NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "tax_year" integer NOT NULL,
    "description" text NOT NULL,
    "amount" numeric(15,2) NOT NULL DEFAULT 0,
    "type" text NOT NULL CHECK (type IN ('add_back', 'deduction')),
    "category" text DEFAULT 'manual', -- 'manual', 'wear_and_tear', etc.
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS policies
ALTER TABLE "public"."tax_adjustments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's tax adjustments" ON "public"."tax_adjustments"
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their company's tax adjustments" ON "public"."tax_adjustments"
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their company's tax adjustments" ON "public"."tax_adjustments"
    FOR UPDATE USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their company's tax adjustments" ON "public"."tax_adjustments"
    FOR DELETE USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE user_id = auth.uid()
        )
    );
