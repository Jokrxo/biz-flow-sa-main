## What I Will Change
- Add partial payments with amount entry and outstanding balance update.
- Fix schema error for `paid_at` and track cumulative `amount_paid` on invoices.
- Ensure `sent` posts to Revenue and Debtors reliably, and paid posts to Bank/settles Debtors.
- Improve posting feedback and prevent silent skips.

## Database Updates
- In `invoices` table:
  - Add `paid_at DATE NULL` to store payment completion date.
  - Add `amount_paid NUMERIC DEFAULT 0 NOT NULL` to track cumulative payments.
  - Optionally add `status` value `partially_paid` (no constraint exists; UI will use it).
- Keep existing posting tables; no changes needed.

## Sales Invoices UI/Logic
- Payment flow in `src/components/Sales/SalesInvoices.tsx`:
  - Change the payment dialog to include `Payment Amount` (number) and `Payment Date` (date) and optional bank account selector.
  - Compute `outstanding = invoice.total_amount - invoice.amount_paid` and validate: `0 < amount <= outstanding`.
  - On confirm:
    - Insert `transactions` with `transaction_date = chosen_date`, `total_amount = amount`, `reference_number = invoice_number`.
    - Post entries:
      - `Bank` `Dr amount`
      - `Accounts Receivable` `Cr amount`
    - Update `invoice.amount_paid += amount`.
    - If `invoice.amount_paid >= total_amount`:
      - Set `status = 'paid'` and `paid_at = chosen_date`.
    - Else set `status = 'partially_paid'`.
  - Remove duplicate-posting guard for `paid` so multiple payments are allowed; keep guard for `sent`.
  - Show posting audit banner with exact Dr/Cr and dates (already added; extend to show outstanding balance after payment).

## Ensure Revenue/Debtors Show in Reports
- Harden account resolution (already improved) and add explicit user feedback:
  - If Revenue or Debtors not found, show a destructive toast naming what’s missing and how to fix (account type/name/code).
  - When `sent` posts, ensure `transactions.transaction_date = invoice_date` and call `refresh_afs_cache` after entries.
- Reporting checks:
  - `EnhancedFinancialReports` already aggregates by `transaction_entries.transactions.transaction_date` and includes `revenue`/`income` types and `asset` types.
  - Add a small diagnostic note under trial balance if no entries found for the selected period, suggesting to widen the range or check `invoice_date`/`payment date`.

## Edge Cases & Errors
- Fix schema error: replace usage of `paid_at` with existing fields until migration is applied. After migration, use `paid_at` to timestamp full settlement.
- If `bank_accounts` table has no rows, still post GL to Bank chart account; show a non-blocking warning that bank balance RPC skipped.
- Add a visible toast if `ensureNoDuplicatePosting(...)` stops a `sent` post due to prior posting.

## Verification
- Create a test invoice, set to `sent`:
  - Check Income Statement: Revenue increases.
  - Check Balance Sheet: Debtors increases under Current Assets.
  - Check Trial Balance tab: Debtors shows Debit; Revenue shows Credit.
- Make a partial payment (e.g., 50%):
  - Bank increases by amount; Debtors decreases by same amount.
  - Invoice status becomes `partially_paid`; outstanding decreases.
- Make final payment:
  - Status becomes `paid`; `paid_at` set; outstanding goes to zero.

## Files to Update
- `src/components/Sales/SalesInvoices.tsx`: payment dialog (amount/date), posting logic to accept partial amounts, invoice updates, duplicate guard changes, enhanced audit banner.
- `supabase/migrations/*` (new migration): add `paid_at` and `amount_paid` columns to `invoices`.
- `src/components/FinancialReports/EnhancedFinancialReports.tsx`: add diagnostic note when period has no entries.

## Expected Outcome
- Payments can be partial or full, accurately reducing Debtors and increasing Bank.
- `sent` reliably recognizes revenue and Debtors; reports reflect by period.
- No more `paid_at` schema errors; outstanding balances tracked per invoice.
- Better transparency via audit banner and period diagnostics.