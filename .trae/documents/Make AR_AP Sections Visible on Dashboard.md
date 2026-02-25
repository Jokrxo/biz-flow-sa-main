## Diagnosis
- AR/AP cards render under conditions like `widgets.arUnpaid`. If your localStorage `dashboardWidgets` has `arUnpaid=false`, the AR/AP charts won’t show.
- The dashboard uses month/year filters; if the selected period has no unpaid invoices/bills, charts remain empty.

## Quick Steps (No Code)
1. Open the Dashboard and click the gear (Customize Dashboard). Ensure the AR-related widget is enabled (look for AR/AP widgets). 
2. Clear stale widget settings: remove `localStorage['dashboardWidgets']` and reload the page; defaults will show widgets.
3. Select a month/year with data; ensure there are unpaid invoices/bills.

## Implementation Plan (Code)
1. Add explicit widget toggles `arOverview` and `apOverview` with default `true` in `DashboardOverview` state, and persist them to `localStorage`.
2. Render AR/AP cards under `widgets.arOverview` and `widgets.apOverview` instead of piggybacking on `arUnpaid`.
3. Add clear section headers: “Receivables Overview (AR)” and “Payables Overview (AP)” so it’s obvious when visible.
4. Add strong fallbacks:
   - If `dashboardWidgets` lacks new keys, merge with defaults (`arOverview: true`, `apOverview: true`).
   - Show “No data for selected period” messages when arrays are empty.
5. Optional: Add quick presets (This Month/Last Month) to AR/AP filters to surface data easily.

## Acceptance Criteria
- AR/AP sections appear by default on the dashboard.
- The Customize panel shows `arOverview`/`apOverview` toggles that reliably hide/show the sections.
- Empty-state messages appear when there’s no data; otherwise charts and KPIs render.
- No runtime errors; build/dev server clean.