## Diagnosis
- Verify core accounts exist and are active for your company: `1200 Accounts Receivable (asset)`, `1100 Bank (asset)`, `4000 Sales Revenue (revenue)`.
- Confirm RLS policies allow reading and inserting `transaction_entries` tied to your company.
- Inspect a sample invoice’s postings: ensure `transactions` and `transaction_entries` were created with correct amounts, account IDs, and non-null `transaction_date`.
- Validate reports filter by `DATE` range, not ISO timestamps, to avoid silently excluding entries.

## Code Corrections
- Enforce exact account codes in posting:
  - Sent: Dr `1200` Receivable, Cr `4000` Revenue, Cr VAT liability if tax.
  - Paid: Dr `1100` Bank, Cr `1200` Receivable.
- Ensure `transaction_entries.status` uses allowed values (e.g., `approved`) and `transactions.status` set to `posted` after entries.
- Use selected Sent/Payment date for `transactions.transaction_date` so entries fall inside report period.
- Reports: filter by `YYYY-MM-DD` dates to match `transactions.transaction_date` type.

## Database Fixes
- Ensure core accounts via `ensure_core_accounts(_company_id)`; add/align codes and types if missing.
- Add SELECT RLS policy on `transaction_entries` so reports can read entries for transactions in your company.
- Backfill existing invoices to ledger:
  - For `sent` or `sent_at` present: insert `transactions` and `transaction_entries` for Receivable/Revenue/VAT.
  - For invoices with `amount_paid > 0`: insert Bank/Receivable payment entries using `paid_at` or `invoice_date`.
  - Avoid duplicates by checking `reference_number = invoice_number` and description pattern.

## Execution Steps
1. Apply migrations: core accounts, `transaction_entries` SELECT RLS, and backfill function.
2. Run backfill RPC for your company to migrate past invoices.
3. Post a new invoice: press Sent (choose date inside report period). Verify TB shows Receivable and Revenue; BS and PL reflect values.
4. Mark the invoice Paid with a real bank account; verify Bank and Receivable move; TB updates.

## Validation
- Open Reports and set period to include invoice dates; confirm TB/BS/PL show movements.
- Cross-check a sample invoice against `transactions` and `transaction_entries` rows.
- If Bank account balances need historical updates, plan a follow-up to map payments to specific bank accounts.

## Risks & Notes
- Historical payments may lack bank selection; backfill keeps statements correct but won’t update bank account balances. A safe enhancement can be added later with explicit mapping.
- If any core account codes differ in your Chart, we will align names but keep the codes `1200/1100/4000` for grouping under Current Assets and Revenue.