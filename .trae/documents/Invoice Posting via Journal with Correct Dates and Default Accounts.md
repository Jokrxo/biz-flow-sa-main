## Goal
- Post invoices via the Transaction Journal so users confirm the double‑entry before it hits Trial Balance and AFS.
- Ensure dates align (use `invoice_date` for Sent; user‑selected `payment_date` for Paid).
- Prefill journal with Accounts Receivable (`1200`) and Revenue (`4000`) for Sent; Bank (`1100`) and AR (`1200`) for Paid.

## Workflow Changes
- SalesInvoices: Add “Post via Journal” actions for Sent and Paid.
- Open TransactionFormEnhanced with prefilled fields:
  - Header: `transaction_date`, `description`, `reference_number`, `transaction_type`, optional `bank_account_id`.
  - Lines: prefilled debit/credit rows (plus VAT Output `2100` when tax applies).
- User reviews/edits and submits; app writes `transactions`, `transaction_entries`, and `ledger_entries`, sets status `posted`.

## Date Alignment
- Sent → `transaction_date = invoice_date`.
- Paid → `transaction_date = payment_date` chosen in the modal.
- Trial Balance filters use `transactions.transaction_date`, so postings appear in the correct period.

## Prefill Rules
- Sent (Accrual):
  - Dr AR (`1200`) for total
  - Cr Revenue (`4000`) for subtotal
  - Cr VAT Output (`2100`) for tax (if any)
  - Type: `sales`
- Paid:
  - Dr Bank (`1100`) for amount paid
  - Cr AR (`1200`) for amount paid
  - Type: `receipt`

## Validations
- Ensure core accounts exist; call `ensure_core_accounts` if missing.
- Verify bank ledger is `is_cash_equivalent` for Balance Sheet.
- Validate double‑entry totals match; UUID formats; non‑future `invoice_date`.

## Implementation Steps
1. SalesInvoices: add handlers “Post via Journal (Sent/ Paid)” that build a `prefill` payload and open TransactionFormEnhanced.
2. TransactionFormEnhanced: accept and render `prefill` lines; lock defaults to `1200/4000` or `1100/1200` but allow edits.
3. On submit: write `transactions`, `transaction_entries`, `ledger_entries`, set `status: posted`, call `update_bank_balance` for Paid.

## Verification
- Post Sent → TB shows AR↑/Revenue↑ on `invoice_date`; P&L includes revenue; BS includes AR.
- Post Paid → TB shows Bank↑/AR↓ on `payment_date`; Dashboard cash updates via RPC.
- Reports match TB for the period.

## Optional Backfill
- Detect invoices with missing/incorrect legs or dates; offer “Post via Journal” to correct.
- Recompute TB and confirm debits equal credits.

Confirm and I’ll implement these changes right away.