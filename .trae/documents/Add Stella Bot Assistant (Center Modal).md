## Overview
- Create a system assistant named "Stella Bot" that displays in a centered, professional popup modal.
- Stella provides quick answers, live updates, and shortcuts, scoped to the current company.

## Trigger & Access
- Add a `Port` button in the dashboard header to open Stella.
- Add a keyboard shortcut (e.g., `Ctrl+Shift+P`) to open/close Stella.

## UI/UX
- Use existing UI components (Dialog, Tabs, Input, Command) for a polished modal.
- Modal layout (centered):
  - Ask (search-style input + responses)
  - Live Feed (real-time activity stream)
  - Shortcuts (one-click actions: open Transactions, Sales, Purchase, Budget, Bank)
  - Diagnostics (recent errors/alerts, data checks)

## Data & Knowledge
- Company-scoped context:
  - Load `company_id` from `profiles` and scope all queries.
  - Aggregate key metrics: counts and recent items from `transactions`, `invoices`, `bills`, `purchase_orders`, `budgets`, `bank_accounts`, `items`, `customers`.
- Answer logic:
  - Pattern-based responses for common requests (e.g., "budget actual", "unpaid invoices", "bank balance", "vat totals").
  - Return links to relevant modules (navigate to pages).
  - Optional: integrate LLM later via environment keys (kept disabled until configured).

## Live Updates
- Subscribe to Supabase realtime (`postgres_changes`) with `filter: company_id=eq.<company_id>`:
  - Tables: `transactions`, `transaction_entries`, `invoices`, `bills`, `purchase_orders`, `budgets`, `bank_accounts`, `chart_of_accounts`, `items`, `customers`.
- Push concise feed items (title, description, timestamp) into the Live Feed tab.

## Privacy & Security
- All reads and realtime subscriptions are filtered by `company_id`.
- No secrets or keys logged; optional LLM disabled unless configured via environment.

## Implementation Steps
1. Create `StellaBotModal` component with Tabs: Ask, Live Feed, Shortcuts, Diagnostics.
2. Wire Supabase context: get `company_id`, set realtime subscriptions (scoped), and initial loads.
3. Implement Ask tab:
   - Input with debounced handlers
   - Pattern-based responders and navigation links
4. Implement Live Feed tab:
   - Stream updates from subscribed tables as feed items
   - Mark-as-read/clear controls
5. Implement Shortcuts tab:
   - Buttons to navigate to key modules, pre-filtered if needed
6. Implement Diagnostics tab:
   - Show recent failures (e.g., last error toasts captured in client), basic data checks (missing bank account on bank payments, duplicate budgets)
7. Integrate into header:
   - Add `Port` button in `DashboardHeader` to toggle Stella
   - Add keyboard shortcut (global listener) to open/close
8. Styling & polish (responsive, dark/light, accessible focus states)

## Acceptance Criteria
- Pressing `Port` opens the centered Stella popup.
- Stella shows live updates for the current company only.
- Asking common questions returns helpful, scoped answers and quick navigation.
- No cross-company data appears; realtime events are company-filtered.
- Minimal performance impact; subscriptions cleaned up on close.