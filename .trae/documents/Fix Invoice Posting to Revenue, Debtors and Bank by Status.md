## What I Found
- Status controls posting in `src/components/Sales/SalesInvoices.tsx`.
- `sent` posts Dr `Accounts Receivable`, Cr `Revenue` and Cr `VAT Payable` when applicable (updateStatus → postInvoiceSent). See `SalesInvoices.tsx:431-447`, `353-387`.
- `paid` posts Dr `Bank`, Cr `Accounts Receivable` (updateStatus → postInvoicePaid). See `SalesInvoices.tsx:431-447`, `390-429`.
- Journal and GL rows are written to `transaction_entries` and `ledger_entries` (`SalesInvoices.tsx:338-351`).
- Reports aggregate from posted entries by period (`EnhancedFinancialReports.tsx:113-179`). P&L includes `income` and `revenue` accounts (`EnhancedFinancialReports.tsx:181-207`). Balance Sheet groups current assets by `account_code < 1500` (`EnhancedFinancialReports.tsx:270-296`).

## Why Your Revenue/Debtors/Bank May Not Show
1. Period mismatch: `sent` uses `invoice_date` and `paid` uses the payment date (`todayStr`). If the report range excludes those dates, amounts won't appear.
2. Missing/misclassified accounts: If `Accounts Receivable` or `Revenue` aren’t active or have unexpected `account_type`/name, posting can fail or report filters skip them.
3. Current assets classification: Debtors (AR) shows under Current Assets only if its `account_code` is < 1500.
4. No bank account record: Payment posting still writes GL to `Bank`, but the bank balance helper RPC won’t update if `bank_accounts` is empty. Reports still read GL though.
5. Transactions with null dates: Period reports exclude them; warning logic already alerts if any exist.

## Verification Steps I Will Perform
- Confirm posting runs when status changes and produces entries in `transaction_entries` and `ledger_entries` with correct debits/credits.
- Inspect your `chart_of_accounts` to verify:
  - Active `Accounts Receivable` (`asset`) with `account_code` in current assets range (<1500).
  - Active `Revenue` (`revenue` or `income`) account.
  - Optional `VAT Payable` (`liability`).
- Check that report period covers `invoice_date` for sent and the actual payment date for paid.
- Ensure at least one `bank_accounts` record exists (optional, for bank balance RPC).

## Changes I Propose
1. Harden account resolution
- Resolve accounts by explicit codes and fallback names to avoid name mismatches.
- Fail clearly with a user-visible message listing missing accounts and how to fix.

2. Align payment posting date
- Allow payment date selection instead of forcing `todayStr`, so reports reflect the actual receipt period.

3. Current Assets classification
- Add a safeguard: if AR’s `account_code` is missing or ≥1500, flag it and offer to set a standard code (e.g., 1200) to display under Current Assets.

4. Reporting clarity
- Add a Trial Balance view with separate debit/credit columns and per-account balances, so you can visually confirm Debtors on the debit side and Revenue on the credit side.

5. Posting audit in UI
- After status change, show a non-dismissable banner: which accounts were posted, amounts, and the posting date; link to account drilldown.

## Implementation Outline
- Update `SalesInvoices.tsx` to:
  - Use robust `findAccountByCodeOrName(type, codes, names)` with better fallbacks.
  - Add optional payment date selector and pass it to `postInvoicePaid`.
  - Show posting audit results and errors.
- Add a `TrialBalance` component that aggregates `transaction_entries` by period and displays DR/CR columns.
- Add checks and guidance UI for `chart_of_accounts` configuration (active flags, types, and codes), with quick links to fix.

## Expected Outcome
- When an invoice is `sent`, revenue appears under reporting, debtors increases under current assets, and trial balance shows a debit for AR and a credit for revenue.
- When an invoice is `paid`, bank increases and debtors decreases, reflected in Balance Sheet, Trial Balance, and cash flow (if enabled).