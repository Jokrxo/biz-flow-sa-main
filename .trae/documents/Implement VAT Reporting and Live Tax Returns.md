## Goals
- Show all Sales Tax (VAT Output) and VAT-bearing expenses (VAT Input) in the Tax module with correct accounting logic.
- Bring the Tax Return module live: create, compute, and file VAT returns per period.

## Data Sources & Logic
- Company-scoped queries using `profiles.company_id`.
- Sales tax (VAT Output):
  - Prefer `transaction_entries` joined to `transactions` where VAT accounts are credited and `transactions.status` in ('approved','posted').
  - Include invoices with `tax_amount` where present, aggregated per period.
- Purchase VAT (VAT Input):
  - Prefer `transaction_entries` where VAT Input accounts are debited and `transactions.status` in ('approved','posted').
  - Include bills/purchase orders if tax fields exist; else rely on transactions with `vat_rate > 0` and element 'expense'.
- Accounting logic:
  - VAT-inclusive transactions: `base = total / (1 + rate%)`, `vat = total - base`.
  - VAT-exclusive transactions: `vat = total * rate%`.
  - Reporting uses posted VAT entries and/or `transactions.vat_amount` when available.

## Module Enhancements
- **TaxOverview**
  - Replace heuristics with totals from VAT entries: `VAT Due = Output (credits) – Input (debits)` for the current period.
  - Display next filing date and realtime update badges.
- **SalesTaxReport**
  - Show month-by-month VAT Output totals and sales base.
  - Add a toggle for sources (Invoices vs Transactions) and ensure both are included.
  - Use `transaction_entries → chart_of_accounts` filter where account name contains 'VAT'/'Tax' for Output rows.
- **PurchaseTaxReport (new)**
  - List VAT Input (expenses attracting VAT) with totals per month and per supplier/category when available.
  - Pull from VAT Input entries (debits); include bills/purchase orders if tax data is present.
- **TaxReturns (live)**
  - Period management (create/edit `tax_periods` with start/end, status).
  - Compute: call RPC `settle_vat_period(_tax_period_id)` to populate `vat_input_total`, `vat_output_total`, `vat_payable`.
  - Filing workflow: mark period as submitted/paid and (optionally) post settlement transaction (Cr Bank, Dr VAT Payable) with bank account selection.
  - Export summary (CSV/PDF) and keep audit data.

## UI/UX
- Tabs in Tax: Overview, Sales VAT, Purchase VAT, Returns, Rates.
- Tables with currency formatting (en-ZA), filters by period and status.
- Realtime `postgres_changes` subscriptions scoped to `company_id` for important tables.

## Implementation Steps
1. Enhance `TaxOverview.tsx` to sum VAT Input/Output from `transaction_entries` + `transactions` status filter, current month window.
2. Expand `SalesTaxReport.tsx` to include invoice tax and a source toggle; correct base calculations with `transactions.vat_inclusive` and `vat_rate` when present.
3. Create `PurchaseTaxReport.tsx` and wire into Tax module; aggregate VAT Input totals per month and list VAT-bearing expenses.
4. Implement `TaxReturns.tsx`:
   - CRUD for `tax_periods` (month/quarter).
   - Compute via `settle_vat_period`, show totals and net payable.
   - Filing dialog: choose bank account, post settlement transaction, update period status.
5. Add company-scoped realtime updates to refresh all views when relevant tables change.
6. Polish UI: consistent cards, tables, filters, and exports.

## Acceptance Criteria
- Sales VAT shows complete and accurate totals across invoices and transactions.
- Purchase VAT lists all VAT-bearing expenses and monthly totals.
- Tax Returns can be created, computed, and marked submitted with net VAT payable displayed.
- All data is company-scoped; realtime updates reflect changes immediately.
