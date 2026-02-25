-- Fix handle_new_user function to be more robust and handle metadata correctly
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
    v_name_parts TEXT[];
BEGIN
    -- Extract metadata with safe defaults
    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    
    -- If first/last name are empty but 'name' exists (from standard signup form), try to split it
    IF v_first_name = '' AND v_last_name = '' AND NEW.raw_user_meta_data->>'name' IS NOT NULL THEN
        v_name_parts := string_to_array(NEW.raw_user_meta_data->>'name', ' ');
        v_first_name := v_name_parts[1];
        IF array_length(v_name_parts, 1) > 1 THEN
            v_last_name := array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' ');
        END IF;
    END IF;

    -- Derive a company name
    v_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'Personal Company');
    
    -- Generate a unique company code using UUID to ensure uniqueness
    v_company_code := 'COMP-' || substr(NEW.id::text, 1, 8);

    -- Create a new company for this user
    -- We use RETURNING to get the ID for the profile
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
    -- Explicitly cast to app_role to avoid type mismatch errors
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'administrator'::public.app_role);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error for debugging (will appear in Supabase logs)
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
    -- Re-raise to ensure transaction aborts
    RAISE;
END;
$$;
