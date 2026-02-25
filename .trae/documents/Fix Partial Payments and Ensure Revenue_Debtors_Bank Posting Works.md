## Problems Identified
- Partial payment sets invoice status to `partially_paid`, but the database has a CHECK constraint (invoice_status_check) that likely only allows `draft/sent/paid/overdue/cancelled`. This causes “violates check constraint” and blocks posting.
- Revenue/Debtors not appearing when setting `sent`: posting may be skipped by the duplicate guard or account resolution fails; period selection may exclude `invoice_date`.
- Bank not increasing on payment: either posting didn’t run due to prior failure, Bank account not found, or payment date/amount logic didn’t persist.

## Changes I Propose
1. Status handling for partial payments
- Do NOT use `partially_paid` status unless the DB constraint supports it.
- Track partial payments via `amount_paid` and keep status as `sent` until fully settled; set status to `paid` only when `amount_paid >= total_amount` and set `paid_at`.

2. Payment flow improvements
- Keep Payment Amount and Date inputs.
- Validate amount against outstanding; post entries Dr Bank / Cr Debtors for the entered amount.
- Update `invoices.amount_paid += amount`; set `status` and `paid_at` as above.

3. Sent posting reliability
- Improve duplicate-posting guard: allow posting if a previous transaction exists but has no `transaction_entries` rows (i.e., a header without entries).
- Show a toast when posting is skipped due to duplicate detection.

4. Account resolution safeguards
- Continue resolving Debtors/Revenue/VAT/Bank by code and name.
- If any required account is missing, show a destructive toast with exact guidance (account type/name/code expectations).

5. Reporting alignment and diagnostics
- Ensure `sent` uses `invoice_date` and `paid` uses the chosen payment date; advise selecting report periods accordingly.
- Add a small diagnostic note in the reports when the period has zero entries.
- Show a toast if `refresh_afs_cache` RPC fails instead of silently swallowing.

## Database Updates
- Ensure `invoices` has `paid_at DATE NULL` and `amount_paid NUMERIC DEFAULT 0 NOT NULL` (migration already added in the repo).
- Leave `invoice_status_check` as is; conform UI to approved statuses.

## Files to Update
- `src/components/Sales/SalesInvoices.tsx`:
  - Adjust status update on payment to use only allowed statuses.
  - Improve duplicate posting guard logic.
  - Add error/diagnostic toasts for RPC failures.
- `src/components/FinancialReports/EnhancedFinancialReports.tsx`:
  - Add an optional diagnostic note when no entries exist for the selected period.

## Verification Plan
- Create an invoice, set to `sent`: verify Revenue on Income Statement, Debtors in Balance Sheet and Trial Balance.
- Make a partial payment: verify Bank increases and Debtors decreases by the amount; status remains `sent`.
- Make final payment: verify status becomes `paid`, `paid_at` is set, outstanding goes to zero.
- Ensure the posting audit banner shows the exact Dr/Cr lines with dates for transparency.

## Expected Outcome
- No more CHECK constraint violations on invoice status for partial payments.
- Revenue appears under Income Statement, Debtors under Current Assets on Balance Sheet when `sent`.
- Bank increases and Debtors settles correctly on `paid`, with trial balance reflecting entries by period.