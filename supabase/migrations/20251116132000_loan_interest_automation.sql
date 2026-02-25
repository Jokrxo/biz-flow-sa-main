-- Create function to automatically calculate and post monthly loan interest
CREATE OR REPLACE FUNCTION post_monthly_loan_interest(_company_id uuid, _posting_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(
    loan_id uuid,
    interest_amount numeric,
    journal_entry_id uuid,
    success boolean,
    message text
) AS $$
DECLARE
    loan_record record;
    monthly_interest numeric;
    interest_expense_account uuid;
    interest_payable_account uuid;
    journal_id uuid;
    entry_id uuid;
BEGIN
    -- Get interest accounts
    SELECT id INTO interest_expense_account 
    FROM chart_of_accounts 
    WHERE company_id = _company_id 
    AND account_type = 'expense' 
    AND (account_name ILIKE '%interest%' OR account_code = '7100')
    LIMIT 1;

    SELECT id INTO interest_payable_account 
    FROM chart_of_accounts 
    WHERE company_id = _company_id 
    AND account_type = 'liability' 
    AND (account_name ILIKE '%interest%payable%' OR account_code = '2350')
    LIMIT 1;

    -- If interest payable account doesn't exist, use loan payable accounts
    IF interest_payable_account IS NULL THEN
        SELECT id INTO interest_payable_account 
        FROM chart_of_accounts 
        WHERE company_id = _company_id 
        AND account_type = 'liability' 
        AND account_code IN ('2300', '2400')
        LIMIT 1;
    END IF;

    -- Loop through all active loans
    FOR loan_record IN 
        SELECT l.*, 
               (l.outstanding_balance * l.interest_rate / 100 / 12) as calculated_interest
        FROM loans l
        WHERE l.company_id = _company_id 
        AND l.status = 'active'
        AND l.outstanding_balance > 0
    LOOP
        monthly_interest := loan_record.calculated_interest;
        
        IF monthly_interest <= 0 THEN
            CONTINUE;
        END IF;

        -- Create journal entry for interest
        INSERT INTO transactions (
            company_id,
            user_id,
            transaction_date,
            description,
            reference_number,
            total_amount,
            transaction_type,
            status
        ) VALUES (
            _company_id,
            auth.uid(),
            _posting_date,
            'Monthly interest on loan ' || loan_record.reference,
            'INT-' || to_char(_posting_date, 'YYYYMM') || '-' || loan_record.reference,
            monthly_interest,
            'loan_interest',
            'approved'
        ) RETURNING id INTO journal_id;

        -- Debit interest expense
        INSERT INTO transaction_entries (
            transaction_id,
            account_id,
            debit,
            credit,
            description,
            status
        ) VALUES (
            journal_id,
            interest_expense_account,
            monthly_interest,
            0,
            'Interest expense on loan ' || loan_record.reference,
            'approved'
        );

        -- Credit interest payable (or loan payable if no interest payable account)
        INSERT INTO transaction_entries (
            transaction_id,
            account_id,
            debit,
            credit,
            description,
            status
        ) VALUES (
            journal_id,
            interest_payable_account,
            0,
            monthly_interest,
            'Interest payable on loan ' || loan_record.reference,
            'approved'
        );

        -- Record in loan payments as interest only
        INSERT INTO loan_payments (
            loan_id,
            payment_date,
            amount,
            principal_component,
            interest_component
        ) VALUES (
            loan_record.id,
            _posting_date,
            monthly_interest,
            0,
            monthly_interest
        );

        -- Return result
        loan_id := loan_record.id;
        interest_amount := monthly_interest;
        journal_entry_id := journal_id;
        success := true;
        message := 'Interest posted successfully';
        
        RETURN NEXT;
    END LOOP;

    -- Refresh AFS cache
    PERFORM refresh_afs_cache(_company_id);

    -- If no loans processed, return empty result
    IF NOT FOUND THEN
        loan_id := NULL;
        interest_amount := 0;
        journal_entry_id := NULL;
        success := false;
        message := 'No active loans with outstanding balance found';
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;