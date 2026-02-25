create or replace function public.post_manual_transaction(
  _company_id uuid,
  _transaction jsonb,
  _entries jsonb[]
)
returns table(transaction_id uuid, posted_count integer)
language plpgsql security definer set search_path = public as $$
declare v_tx_id uuid; v_count int := 0; v_date date; v_desc text; v_ref text; v_total numeric; v_user uuid; v_bank uuid; v_type text; v_cat text; v_vat_rate numeric; v_vat_amount numeric; v_base_amount numeric; v_vat_inclusive boolean;
begin
  select (_transaction->>'transaction_date')::date, _transaction->>'description', _transaction->>'reference_number', (_transaction->>'total_amount')::numeric,
         (_transaction->>'user_id')::uuid, (_transaction->>'bank_account_id')::uuid, _transaction->>'transaction_type', _transaction->>'category',
         nullif(_transaction->>'vat_rate','')::numeric, nullif(_transaction->>'vat_amount','')::numeric, nullif(_transaction->>'base_amount','')::numeric,
         coalesce((_transaction->>'vat_inclusive')::boolean,false)
  into v_date, v_desc, v_ref, v_total, v_user, v_bank, v_type, v_cat, v_vat_rate, v_vat_amount, v_base_amount, v_vat_inclusive;

  insert into public.transactions(company_id, user_id, bank_account_id, transaction_date, description, reference_number, total_amount, vat_rate, vat_amount, base_amount, vat_inclusive, transaction_type, category, status)
  values (_company_id, coalesce(v_user, auth.uid()), v_bank, v_date, v_desc, v_ref, v_total, v_vat_rate, v_vat_amount, v_base_amount, v_vat_inclusive, v_type, v_cat, 'approved')
  returning id into v_tx_id;

  for v_count in select 0 loop end loop;

  for i in 1..coalesce(array_length(_entries,1),0) loop
    perform 1;
    insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
    values (
      v_tx_id,
      (_entries[i]->>'account_id')::uuid,
      coalesce((_entries[i]->>'debit')::numeric,0),
      coalesce((_entries[i]->>'credit')::numeric,0),
      coalesce(_entries[i]->>'description', v_desc),
      'approved'
    );
    insert into public.ledger_entries(company_id, transaction_id, account_id, entry_date, description, debit, credit, is_reversed)
    values (
      _company_id,
      v_tx_id,
      (_entries[i]->>'account_id')::uuid,
      v_date,
      coalesce(_entries[i]->>'description', v_desc),
      coalesce((_entries[i]->>'debit')::numeric,0),
      coalesce((_entries[i]->>'credit')::numeric,0),
      false
    );
    v_count := v_count + 1;
  end loop;

  update public.transactions set status = 'posted' where id = v_tx_id;
  perform public.refresh_afs_cache(_company_id);
  return query select v_tx_id, v_count;
end;$$;

grant execute on function public.post_manual_transaction(uuid, jsonb, jsonb[]) to authenticated;
grant execute on function public.post_manual_transaction(uuid, jsonb, jsonb[]) to service_role;