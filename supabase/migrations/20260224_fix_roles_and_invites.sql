-- Update handle_new_user to assign 'administrator' role to new company creators
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

    -- Assign 'administrator' role so the creator has full access
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, v_company_id, 'administrator');

    RETURN NEW;
END;
$$;

-- Create a secure function to accept invites
CREATE OR REPLACE FUNCTION public.accept_invite(invite_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_user_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Find the invite
    SELECT * INTO v_invite
    FROM public.invites
    WHERE token = invite_token
    AND expires_at > now();

    IF v_invite IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invite';
    END IF;

    -- Update user profile to the invited company
    UPDATE public.profiles
    SET company_id = v_invite.company_id
    WHERE user_id = v_user_id;

    -- Insert user role for the invited company
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (v_user_id, v_invite.company_id, v_invite.role::app_role)
    ON CONFLICT (user_id, company_id, role) DO NOTHING;

    -- Delete the invite
    DELETE FROM public.invites
    WHERE token = invite_token;

    RETURN jsonb_build_object('success', true);
END;
$$;
