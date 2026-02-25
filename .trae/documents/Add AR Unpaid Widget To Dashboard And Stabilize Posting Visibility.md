## Objectives
- Embed AR "Unpaid by Customer" charts on the main dashboard as a toggleable widget.
- Keep invoices posting to AR=1200, Bank=1100, Revenue=4000 via server RPCs and make results visible in AFS/TB.
- Hide zero-balance lines in Trial Balance.

## Implementation
- Dashboard: Add a new widget `arUnpaid` in `DashboardOverview` with two charts:
  - Top 10 customers by unpaid amount (vertical bar) and donut percentage by customer.
  - Fetch invoices per company using a simple query (like `ARDashboard`), filtered to non-paid/non-cancelled and within a default rolling period.
  - Reuse the KPI totals (Unpaid, Overdue) for a small metric card.
  - Add to widget settings (localStorage persistence) and real-time invoice channel for auto-refresh.
- Posting visibility:
  - Keep current RPCs (`post_invoice_sent`, `post_invoice_paid`) and UI wiring in `SalesInvoices.tsx`.
  - Ensure AFS/TB refresh after RPC calls.
  - Align report date filters with `DATE` fields (already updated) so posted entries are included.
- Trial Balance zero hiding:
  - Filter out accounts with absolute balance < 0.01 before rendering rows in Trial Balance component.

## Verification
- Post Sent and Paid on sample invoices; confirm AR=1200, Bank=1100, Revenue=4000 entries created.
- Dashboard shows AR Unpaid charts and KPI; real-time updates when invoices change.
- Trial Balance, Balance Sheet, Income Statement reflect movements; zero lines hidden.

## Notes
- The `net::ERR_ABORTED` Supabase auth and REST logs indicate network/auth state; not blocking dashboard/AR widget work. We’ll avoid any logout triggers on load and handle session gracefully.
- If bank account table balances need historical backfill (not just ledger), we can add an optional safe routine after this step.

If you approve, I will implement the new `arUnpaid` widget, wire data fetch and realtime updates, add zero-hiding in TB, and revalidate posting visibility across AFS/TB and the dashboard.