## Goals
- Use chart of accounts as the source for budget lines (select account, not free-form category).
- Compute Actuals from posted ledger entries per account and month; Variance = Budget − Actual.
- Present a single table with columns for all months (Jan–Dec) for a selected year.

## Current State
- Budget items store `category`, `budget_year`, `budget_month`, `budgeted_amount`.
- Actuals are derived from `expenses` table by matching category and month.
- UI shows one month at a time via filters (Year/Month).

## Data Model Changes
- Add `account_id UUID REFERENCES chart_of_accounts(id)` to `public.budgets`.
- Keep existing rows; for new entries use `account_id` and deprecate `category` (show only for legacy items).
- Ensure RLS remains consistent (filter by `company_id`).

## Actuals Calculation
- For each `account_id` and month in the selected year:
  - Query `ledger_entries` with `entry_date` in that month and `account_id` = budget line account.
  - Compute monthly actual based on account normal balance:
    - Expense: sum(debit − credit)
    - Income: sum(credit − debit)
    - Others: treat per `chart_of_accounts.normal_balance`.
  - Ignore reversed ledger entries (`is_reversed = FALSE`).

## UI/UX Changes
- Form:
  - Replace Category select with Account select loaded from `chart_of_accounts` (filter to `expense` and optionally `income`).
  - Allow adding budget lines for a whole year with 12 inputs (Jan–Dec) or add one line per month via quick-add.
- Table:
  - Pivot view: rows per account, columns Jan–Dec.
  - Each cell shows Budget and Actual (e.g., “B: 10,000 / A: 8,500”) and color-coded variance.
  - Year selector only; remove Month selector.
  - Aggregates at row end: totals and annual variance per account; top bar shows total budget, total actual, variance, utilization.
- Editing:
  - Inline edit of monthly budget amounts; saving updates or inserts the per-account-per-month records into `budgets`.

## Implementation Steps
1. Migration: add `account_id` to `budgets`, backfill legacy items by attempting to map `category` names to accounts (best-effort; else leave null and mark as legacy).
2. Data fetch:
  - Load chart_of_accounts list (expense/income) for the company.
  - Load budget rows for the selected year, grouped by `account_id`.
3. Compute actuals:
  - For each account and month, sum `ledger_entries` per rules above.
  - Build an in-memory structure: `{ account_id, account_name, monthly: {1..12: {budget, actual, variance}} }`.
4. UI render:
  - Replace BudgetManagement filters with a Year-only selector.
  - Render the 12-month table; provide inline edit for budget cells and a Save action.
5. Posting flow impact:
  - No change to posting; existing entries posted to ledger automatically feed Actuals.
6. Edge cases:
  - Accounts with no budget show Actual-only if desired (toggle to show/hide).
  - Legacy budgets without `account_id`: display in a separate section until migrated.
  - Multi-currency: assume home currency (ZAR); formatting stays `en-ZA`.

## Confirmation
- On approval, I will add the schema change, refactor BudgetManagement to account-based budgets, compute actuals from ledger entries, and implement the 12-month table with inline editing.