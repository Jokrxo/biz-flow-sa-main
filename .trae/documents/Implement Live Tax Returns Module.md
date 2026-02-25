## Goals
- Make Tax Returns live with period creation, computation, filing and settlement posting.
- Cover VAT Output (sales) and VAT Input (purchases) per period; show net VAT payable/refundable.

## Data & Accounting
- Company-scoped queries using `profiles.company_id`.
- Periods table: `tax_periods` (already in migrations) with fields: company_id, period_type ('vat'), period_start, period_end, vat_input_total, vat_output_total, vat_payable, status ('active','draft','closed').
- Computation: call `settle_vat_period(_tax_period_id)` to populate input/output/payable from posted entries.
- Settlement posting:
  - If payable > 0: record payment transaction (`Dr VAT Payable / Cr Bank`) for selected bank account and date.
  - If refundable < 0: record refund transaction (`Dr Bank / Cr VAT Receivable`).
  - Insert `transactions` with status 'pending' → insert `transaction_entries` status 'approved' → update `transactions` status 'posted'.

## UI/UX
- Enhance `TaxReturns` component with:
  - Period selector and create dialog (month/quarter start/end).
  - Returns list (period, input, output, net, status) with actions.
  - Actions: Compute (RPC), File Return (mark submitted), Record Payment/Refund (bank/date/amount), Export CSV/PDF.
- Validation: bank account must belong to the company; amount matches net payable/refundable.
- Realtime updates: subscribe to `tax_periods`, `transactions`, `transaction_entries` for live refresh; filter by company_id.

## Implementation Steps
1. Build period CRUD UI in `TaxReturns.tsx` (create/edit/delete with date pickers and type 'vat').
2. List periods with computed totals; add "Compute" button to call `settle_vat_period` and refresh.
3. Add "File Return" to set status submitted/closed and timestamp.
4. Add "Record Payment/Refund" dialog:
   - Load company `bank_accounts`; choose account and date.
   - Create settlement transaction with correct double-entry and statuses.
5. Add export buttons (CSV and optional PDF) for period summaries and transaction list.
6. Add company-scoped realtime subscriptions to refresh views on changes.

## Acceptance Criteria
- Users can create VAT periods, compute totals, and view net VAT payable/refundable.
- Filing updates period status; settlement posts correct double-entry with bank selection.
- Exports produce accurate CSV summaries.
- All operations are company-scoped and update live via realtime subscriptions.