## Objective
Complete the integration of Sales AR and Purchase AP dashboards into the main Dashboard Overview with full filters, charts, KPIs, and professional layout.

## Remaining Work
- Add local AR filters (date range, customer, status scope) mirroring Sales AR.
- Add local AP filters (date range, supplier, status scope, source scope) mirroring Purchase AP.
- Extract reusable components (KPIGrid, Top10BarChart, DonutPieChart, AgingTable) and refactor DashboardOverview to use them.
- Ensure data loaders honor local filters and the global month/year selection does not override AR/AP sections.
- Add widget toggles for `arOverview` and `apOverview` persisted to `dashboardWidgets`.
- Wire realtime subscriptions to `invoices`, `bills`, `purchase_orders`, and `transactions` for AR/AP sections.

## Implementation Steps
1. Create small reusable chart/table components under `src/components/Dashboard/common/`.
2. Move AR/AP UI controls (Select/Input/Buttons) into the top of each section in DashboardOverview.
3. Port filtering logic from `Sales/ARDashboard.tsx` and `Purchase/APDashboard.tsx` and adapt to company context.
4. Render:
   - AR: KPI grid, Top 10 bar, donut, aging summary, unpaid list.
   - AP: KPI grid, Top 10 bar, donut, aging summary.
5. Persist widget visibility toggles and ensure they conditionally render these sections.
6. Run and verify with test data; adjust formatting, colors, and card layout for consistency.

## Acceptance Criteria
- AR/AP sections match module dashboards in data and visuals.
- Filters work identically and update charts and tables.
- Realtime changes update AR/AP sections without manual refresh.
- Clean build; no runtime errors; consistent styling.