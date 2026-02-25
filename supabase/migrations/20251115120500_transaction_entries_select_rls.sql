-- Allow users to read transaction entries for transactions in their company
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'transaction_entries' 
      AND policyname = 'Users can view transaction entries in their company'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view transaction entries in their company" ON public.transaction_entries';
  END IF;
END
$$;

CREATE POLICY "Users can view transaction entries in their company"
ON public.transaction_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_entries.transaction_id
      AND t.company_id = public.get_user_company(auth.uid())
  )
);