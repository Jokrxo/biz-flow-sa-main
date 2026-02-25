-- V3 Fix: Ensure extensions and safe role handling
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing trigger and function first to ensure clean state
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with robust error handling and explicit types
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_company_name TEXT;
    v_company_code TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
    v_raw_name TEXT;
    v_space_pos INT;
BEGIN
    -- Log start of execution
    RAISE LOG 'handle_new_user started for user %', NEW.id;

    -- Extract metadata with safe defaults
    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    v_raw_name := COALESCE(NEW.raw_user_meta_data->>'name', '');
    
    -- If first/last name are empty but 'name' exists, split it safely
    IF v_first_name = '' AND v_last_name = '' AND v_raw_name != '' THEN
        v_space_pos := position(' ' in v_raw_name);
        IF v_space_pos > 0 THEN
            v_first_name := substring(v_raw_name from 1 for v_space_pos - 1);
            v_last_name := substring(v_raw_name from v_space_pos + 1);
        ELSE
            v_first_name := v_raw_name;
            v_last_name := '';
        END IF;
    END IF;

    -- Derive a company name
    v_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'Personal Company');
    
    -- Generate a unique company code using UUID to ensure uniqueness
    -- Using substring of UUID is safe enough for uniqueness in this context
    v_company_code := 'COMP-' || substr(NEW.id::text, 1, 8);

    -- Create a new company for this user
    INSERT INTO public.companies (name, code)
    VALUES (v_company_name, v_company_code)
    RETURNING id INTO v_company_id;

    -- Create the user's profile linked to their company
    INSERT INTO public.profiles (user_id, company_id, first_name, last_name, email)
    VALUES (
        NEW.id,
        v_company_id,
        v_first_name,
        v_last_name,
        NEW.email
    );

    -- Assign 'administrator' role so the creator has full access
    -- We use a string literal cast to the enum type to be explicit
    -- We also add ON CONFLICT DO NOTHING just in case
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'administrator'::public.app_role)
    ON CONFLICT (user_id, company_id, role) DO NOTHING;

    RAISE LOG 'handle_new_user completed successfully for user %', NEW.id;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log specific error details
    RAISE WARNING 'handle_new_user failed: % %', SQLSTATE, SQLERRM;
    -- Re-raise to abort transaction and notify client
    RAISE;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
