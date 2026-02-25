## How Posting Works Today
- **Transactions → Entries**: A financial event creates a `transactions` row, then double‑entry legs in `transaction_entries` (debit/credit). Examples:
  - Opening bank balance inserts a `transactions` row and two legs, then marks approved and updates bank running balance `src/components/Bank/BankManagement.tsx:235-263`.
  - Bank reconciliation writes both `transaction_entries` and `ledger_entries`, then sets status to `posted` and calls `update_bank_balance` `src/components/Bank/BankReconciliation.tsx:191-224`.
- **Bank Running Balance**: Updated via RPC `update_bank_balance` when cash moves `src/components/Bank/BankManagement.tsx:262`, `src/components/Bank/BankReconciliation.tsx:224`.
- **Ledger Mirror**: Some flows write `ledger_entries` explicitly (reconciliation), and others rely on DB triggers to mirror entries when status flips to `approved/posted` (per migrations).

## Trial Balance Calculation
- **Period TB from entries**: TB is computed by summing `transaction_entries` joined to `transactions.transaction_date` within a date range, mapping sign by account type:
  - Query and accumulation `src/components/FinancialReports/EnhancedFinancialReports.tsx:122-171`.
  - Output list used by Profit & Loss and Balance Sheet `src/components/FinancialReports/EnhancedFinancialReports.tsx:100-109`.
- **Balance logic**: Assets/Expenses use `debit − credit`; Liabilities/Equity/Revenue use `credit − debit` `src/components/FinancialReports/EnhancedFinancialReports.tsx:168-171`.

## Reporting Consumption
- **Profit & Loss**: Uses trial balance balances directly, grouping Revenue, COGS, Expenses `src/components/FinancialReports/EnhancedFinancialReports.tsx:186-216`.
- **Balance Sheet**: Built from trial balance by category; cash accounts must be flagged correctly (cash equivalents) in `chart_of_accounts`.
- **Dashboard/Analytics**: Pull metrics off entries and status filters; lucide components and tabs are present `src/components/Dashboard/DashboardOverview.tsx:17`.

## Expected Invoice Postings
- **Invoice Issued (Accrual)**: Debit Accounts Receivable (AR, e.g., `1200`); Credit Revenue (`4000`); VAT if applicable: Credit VAT Output, Debit AR.
- **Invoice Paid**: Debit Bank (`1100`); Credit AR (`1200`); Update bank running balance via RPC; Mark transaction `posted/approved`.
- These should produce two or four `transaction_entries` legs per invoice event, and a ledger mirror so TB and reports reflect them.

## Likely Causes of Incorrect Invoice Posting
- **Missing or wrong legs**: One side not inserted, or VAT leg omitted.
- **Wrong account classification**: AR/Revenue accounts not set to correct `account_type`, causing sign errors in TB.
- **Status mismatch**: `transactions.status` stays `pending`, so ledger mirror/aggregations don’t include it.
- **Date misalignment**: Using `due_date` instead of `invoice_date` or payment date, so TB period filters exclude entries.
- **Bank not flagged cash**: Bank ledger not marked `is_cash_equivalent`, so reporting categories misplace cash.

## Implementation Plan
### Phase 1: Trace & Confirm
- Instrument the invoice issue and payment paths to capture: created `transactions`, inserted `transaction_entries`, resulting `ledger_entries`, status changes, and dates.
- Verify AR (`1200`), Revenue (`4000`), VAT accounts exist and `account_type`/codes are correct per company.

### Phase 2: Standardize Posting Engine
- Create a single posting helper that:
  - Validates double‑entry balance before write.
  - Inserts both `transaction_entries` and `ledger_entries` consistently.
  - Sets `transactions.status` to `approved/posted` atomically.
  - Calls `update_bank_balance` only when a bank/cash account is a leg.
- Apply this to invoice issue and payment flows, and bank reconciliation.

### Phase 3: Align Trial Balance & Reporting
- Ensure TB and reports reference the same source of truth (prefer `ledger_entries` for statements), keeping period filters aligned to `transactions.transaction_date` or `ledger_entries.entry_date`.
- Confirm cash accounts marked `is_cash_equivalent` for proper Balance Sheet placement.

### Phase 4: Backfill & Fix Existing Data
- Detect invoices with incomplete legs or wrong statuses; backfill missing `transaction_entries`/`ledger_entries` and correct dates/statuses.
- Recompute TB and verify `total debits == total credits` for affected periods.

### Phase 5: Tests & Verification
- Add unit tests for posting helper and integration tests that:
  - Issue invoice → TB shows AR↑, Revenue↑; Pay invoice → Bank↑, AR↓.
  - Include VAT scenarios.
- Add reconciliation tests to confirm RPC bank updates and ledger entries.

## What You’ll See After Fix
- Issued invoices consistently raise AR and revenue in TB and P&L for the correct period.
- Payments move balances from AR to Bank, and bank running balance updates correctly.
- Reports and TB remain in sync across periods and statuses.

Please confirm this plan. Once approved, I’ll implement the posting helper, align invoice flows, backfill data, and verify with tests and trial balance checks.