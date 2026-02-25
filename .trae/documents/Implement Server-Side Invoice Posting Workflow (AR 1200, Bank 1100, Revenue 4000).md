## Goal
- Make Sent invoices post to `1200 Receivable` and `4000 Sales Revenue` and show under Current Assets and Income Statement.
- Make Paid invoices post to `1100 Bank` and reduce `1200 Receivable`, updating Trial Balance and AFS reliably.

## Approach
- Move posting from client to server-side RPC functions for consistency and RLS-safe writes.
- Use exact account codes (`1200`, `1100`, `4000`) with type checks to guarantee proper grouping.
- Fix reporting to read from a consolidated trial balance view and date-range that matches `DATE` fields.
- Backfill existing invoices to populate AFS/TB immediately.

## Server RPCs (New)
1. `post_invoice_sent(_invoice_id UUID, _post_date DATE)`
- Read invoice: subtotal, tax_amount, total_amount, customer_name, invoice_number.
- Find accounts by `account_code` within company: `1200` (asset), `4000` (revenue), VAT `2200/2210` (liability).
- Insert `transactions` row: `status='posted'`, `transaction_date=_post_date`.
- Insert `transaction_entries`: Dr `1200` total; Cr `4000` subtotal; Cr VAT liability tax>0.
- Prevent duplicates via `reference_number=invoice_number` check.

2. `post_invoice_paid(_invoice_id UUID, _payment_date DATE, _bank_account_id UUID, _amount NUMERIC)`
- Validate bank exists and belongs to company; validate `_amount` <= outstanding.
- Find accounts: `1100` (asset bank), `1200` (asset receivable).
- Insert `transactions` (`status='posted'`, `transaction_date=_payment_date`, `bank_account_id=_bank_account_id`).
- Insert entries: Dr `1100` amount; Cr `1200` amount.
- Call `update_bank_balance(_bank_account_id, _amount, 'add')`.
- Update invoice `amount_paid` and `paid_at` as needed.

## Triggers (Optional)
- On `invoices.status` update to `sent`/`paid`, call the above RPCs automatically (guarded by a setting `auto_posting_enabled`).

## Reporting Fix
- Use `trial_balance_summary` view (already present) to compute TB for a period.
- Filter by `transactions.transaction_date` using `YYYY-MM-DD` bounds.
- Recompute BS and PL from the TB results. This avoids nested joins that can be blocked by RLS.

## Backfill Existing Invoices
- Create `backfill_invoice_postings(_company_id UUID)` to:
  - For invoices with `sent_at`/`status='sent'`: post Receivable/Revenue/VAT if missing.
  - For invoices with `amount_paid>0`: post Bank/Receivable payment using `paid_at` or `invoice_date`.
  - Skip duplicates by checking existing `transactions` on `reference_number` and description.
- Run once per company to populate historical postings.

## UI Updates
- Replace client posting (`postInvoiceSent`, `postInvoicePaid`) with calls to new RPCs.
- Require bank selection in Paid dialog; keep date pickers; show success/failure toasts.

## Validation
- Post `INV-481823` with Sent date `2025-11-15`; verify TB shows Dr `1200` R 57,500 and Cr `4000`/VAT in period.
- Post `INV-565075` as Paid `2025-11-15` with bank; verify TB shows Dr `1100` R 701,500 and Cr `1200`.
- Check AFS Balance Sheet (Current Assets → Receivables) and Income Statement (Sales Revenue) reflect values.

## Rollback & Safety
- All RPCs check for duplicates and account existence; no destructive changes.
- Backfill function only inserts missing postings; can be rerun safely.

If you approve, I will implement the RPCs, wire the UI to them, switch reports to the summary view with correct date filtering, and run the backfill so your existing invoices appear immediately.