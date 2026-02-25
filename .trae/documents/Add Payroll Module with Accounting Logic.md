## Scope
- Implement a payroll module for monthly pay runs with South Africa context (PAYE, UIF, SDL) and strict double‑entry posting.
- Manage employees, pay items (earnings/deductions), employer contributions, pay runs, payments and statutory remittances.

## Accounting Logic
- No VAT on payroll.
- At run finalization:
  - Dr `Salaries & Wages` (gross earnings)
  - Cr `Wages Payable` (net pay)
  - Cr `PAYE Payable` (employee PAYE)
  - Cr `UIF Payable` (employee UIF)
  - Employer contributions:
    - Dr `UIF Employer Expense`, Dr `SDL Expense`
    - Cr `UIF Payable` (employer portion), Cr `SDL Payable`
- At net pay payment:
  - Dr `Wages Payable`, Cr `Bank`
- At statutory remittance:
  - Dr `PAYE/UIF/SDL Payable`, Cr `Bank`

## Chart of Accounts
- Reuse core accounts pattern and add payroll accounts (codes illustrative):
  - Expenses: `5000 Salaries & Wages`, `5100 UIF Employer Expense`, `5110 SDL Expense`
  - Liabilities: `2105 Wages Payable`, `2300 PAYE Payable`, `2310 UIF Payable`, `2320 SDL Payable`
  - Assets: `1100 Bank` (existing)
- Implement a migration to seed missing payroll accounts per company and protect them (similar to `ensure_core_accounts`).

## Data Model
- `employees` (company_id, name, email, id_number, start_date, active)
- `pay_items` (company_id, type: earning|deduction|employer, code, name, taxable flags)
- `employee_pay_items` (employee_id, pay_item_id, amount, rate, unit)
- `pay_runs` (company_id, period_start, period_end, status: draft|finalized|paid)
- `pay_run_lines` (pay_run_id, employee_id, gross, net, paye, uif_emp, uif_er, sdl_er, other totals)
- Derived tables or views for reporting summaries.

## Calculation Engine
- Gross‑to‑net:
  - Sum earnings (basic, overtime, allowances) → gross.
  - Apply PAYE via tax table/brackets and rebates.
  - UIF: 1% employee + 1% employer (subject to cap).
  - SDL: 1% employer (if liable).
  - Net = gross − employee deductions (PAYE, UIF, other).
- Configurable `payroll_settings` per company: tax year, UIF cap, SDL liability, additional rules.

## Posting Flows
- Finalize pay run (one `transactions` row per run):
  - Insert `transaction_entries` and mirror `ledger_entries` for legs listed in Accounting Logic.
  - Mark `transactions.status = 'posted'` and `pay_runs.status = 'finalized'`.
- Pay net wages (bank payment):
  - Create `transactions` for payment; post Dr `Wages Payable`, Cr `Bank`; mark `pay_runs.status = 'paid'` when complete.
- Remit statutory (separate transactions per liability):
  - PAYE/UIF/SDL remittances as distinct payments with matching entries.

## Server‑Side RPCs
- `post_pay_run_finalize(pay_run_id)` resolves account IDs by code/type and inserts entries atomically.
- `post_pay_run_pay(pay_run_id, amount)` pays net wages.
- `post_statutory_remit(type, amount, period)` handles PAYE/UIF/SDL remittances.
- Follow the existing RPC style used for invoices (account resolution by `account_code` and mirrored ledger inserts).

## UI/UX
- Pages under `Payroll`:
  - `Employees`: list/create/edit employees and assigned pay items.
  - `Pay Items`: catalog of earnings/deductions/employer contributions.
  - `Pay Runs`: create run (period), add employees, preview calculations, finalize; actions to pay and remit.
  - `Payroll Dashboard`: KPIs and liabilities due; filters by date range.
- Per‑employee payslip: PDF generation and email send (reuse existing PDF and mail patterns).

## Permissions & RLS
- Restrict payroll actions to Admin/Accountant roles (consistent with invoices/transactions).
- RLS: tie all payroll tables to `get_user_company(auth.uid())` and company ownership.

## Reports
- Pay run summary (gross, net, PAYE, UIF, SDL totals).
- Statutory liabilities aging and remittance history.
- Employee year‑to‑date balances.

## Integration Points
- Reuse `transactions` → `transaction_entries` → `ledger_entries` pipeline.
- Account picking uses codes (`1100`, `2105`, `2300`, `2310`, `2320`, `5000`, etc.) with existing helpers.
- Bank reconciliation sees pay runs as outflows against `Wages Payable` when paid.

## Milestones
- Phase 1: Schema & core accounts migration, RLS
- Phase 2: Employees & Pay Items UI
- Phase 3: Pay Run creation + calculation engine
- Phase 4: Finalization posting (RPC) + ledger mirroring
- Phase 5: Payments & statutory remittances
- Phase 6: Payslips PDF + email send
- Phase 7: Dashboard & reports

## Validation
- Unit tests for calculation scenarios (PAYE brackets, UIF cap, SDL on/off).
- Verify ledger balances: totals per run match postings; liabilities clear on remittance.
- Manual UAT with sample employees and a monthly run.

Please confirm, and I will implement Phase 1 (schema and accounts) followed by Phase 2 UI scaffolding, then proceed through the milestones.