-- Create per-user company on signup and assign profile to it
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
BEGIN
    -- Derive a company name from user metadata or fallback
    v_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', COALESCE(NEW.raw_user_meta_data->>'full_name', 'Personal Company'));

    -- Generate a unique company code from the user id
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
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email
    );

    -- Assign a default role within the user's own company
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'accountant');

    RETURN NEW;
END;
$$;

-- Existing trigger on auth.users will call public.handle_new_user()