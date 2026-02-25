## Goal
Copy the Accounts Receivable (Sales AR Dashboard) and Accounts Payable (Purchase AP Dashboard) graphs and KPIs into the main Dashboard Overview, organized in a professional layout.

## Scope
- Include the same KPIs, Top 10 bars, donut charts, aging summary tables, and unpaid lists from Sales AR and Purchase AP.
- Provide the same filters (date range, customer/supplier, status, source) where applicable.
- Keep existing dashboard month/year controls for global charts; add local AR/AP range controls.

## UI & Layout
- Add two sections inside Dashboard Overview:
  1. **Receivables (AR)**: KPI grid, Top 10 bar, donut, aging table, unpaid list.
  2. **Payables (AP)**: KPI grid, Top 10 bar, donut, aging table.
- Use existing Card components, consistent colors, and `ResponsiveContainer` from Recharts.
- Add quick presets (Reset/Refresh) and inputs (Start/End date, Customer/Supplier select, Status scope; Source scope for AP) mirroring ARDashboard/APDashboard.
- Add widget toggles for `arOverview` and `apOverview` persisted in `dashboardWidgets`.

## Data Loading
- Supabase queries:
  - AR: `invoices` by `company_id` within range; exclude `paid/cancelled` or use status scope.
  - AP: `bills` and `purchase_orders` by `company_id` within range; map supplier names; compute outstanding for POs by joined payments.
- Derivations:
  - KPIs: unpaid totals, overdue buckets (1–30, 31+, 90+).
  - Charts: Top 10 amounts per customer/supplier; donut by contribution; aging grouped per bucket.
- Realtime:
  - Subscribe to `invoices`, `bills`, `purchase_orders`, `transactions` for live refresh.

## Components (Reusable)
- `KPIGrid`: renders labeled totals with color coding.
- `Top10BarChart`: vertical bar with amount axis and name categories.
- `DonutPieChart`: inner/outer radius donut with legend/tooltip.
- `AgingTable`: tabular buckets for current/overdue ranges.
- Share color constants and number formatting.

## Integration Steps
1. Add AR/AP local filter state and controls to DashboardOverview.
2. Port AR/AP data loaders from Sales ARDashboard and Purchase APDashboard with company scoping.
3. Compute KPIs, charts, aging identical to module dashboards.
4. Render the two sections under Charts grid with professional card styling.
5. Add widget toggles for AR/AP and persist to localStorage.
6. Wire realtime subscriptions for AR/AP sources.

## Acceptance Criteria
- Dashboard shows AR and AP sections identical in content to module dashboards, with the same filters.
- KPIs, Top 10, donut, and aging tables render correctly and update with filters and realtime changes.
- Styling is consistent and professional, using the app’s card and theme.
- No runtime errors; build/dev server runs cleanly.