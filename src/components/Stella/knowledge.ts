export const systemOverview = `
Rigel Business System Overview

Modules
- Dashboard: KPIs and recent activity
- Transactions: Income, Expense, Assets; VAT handling with Input/Output accounts
- Sales: Invoices, Quotes, AR aging
- Purchase: Bills, Product purchases, AP dashboard
- Bank: Accounts and balances
- Budget: Monthly budgets vs actuals from posted entries
- Tax: VAT Input/Output reports; purchases show net (excl. VAT) and VAT correctly
- Trial Balance: Summarizes debit/credit balances
- Reports: Financial statements and analytics
- Payroll, Loans, Fixed Assets, Customers, Settings

Key Behaviors
- Purchases use exclusive VAT: total = net + VAT; entries post VAT Input
- Invoices (sales) treat totals inclusive; entries post VAT Output
- VAT shown on Transactions list is from posted entries or stored vat_amount
- Aborted requests handled; counts use GET with limit(1)
- User tour shows once after first login; tutorial shows once after signup
- Themes: 10 palettes available under Settings → Theme

Accounting Helpers
- Unpaid invoices/bills can be counted via company-scoped queries
- Recent transactions listed by date desc with totals
- Budget actuals derive from posted entries in target month
- Trial Balance is a ledger view of account balances after postings
`;

export const accountingPrimer = `
Accounting Primer
- Assets = Liabilities + Equity
- Income increases equity; Expenses reduce equity
- VAT Input (on purchases) is receivable; VAT Output (on sales) is payable
- Exclusive VAT: VAT = Net × Rate; Inclusive VAT: VAT = Total × Rate/(1+Rate)
- Trial Balance lists account balances; debits on asset/expense, credits on liability/income
`;

export const plainEnglishGuide = `
Plain-English Accounting Guide (for non-accountants)

Core ideas
- Money in vs money out: Profit is earnings after costs; Cash flow is movement of cash in/out.
- What you own vs owe: Assets are things you own; Liabilities are what you owe; Equity is owner value.

Common terms
- Revenue (Sales): Money earned by selling products/services.
- Expense: Cost to run the business (rent, salaries, supplies).
- Profit: Revenue minus expenses.
- Cash Flow: Actual cash received/paid; can differ from profit because of timing.
- Trade Receivables (Customers owe you): Invoices you issued but haven’t been paid yet.
- Trade Payables (You owe suppliers): Bills you haven’t paid yet.
- Inventory (Stock): Products you hold for sale.

VAT simple examples
- Exclusive VAT (Net + VAT): Net R100, VAT 15% → VAT R15, Total R115.
- Inclusive VAT (Total includes VAT): Total R115, VAT portion = R115 × 15% / (1+15%) ≈ R15, Net ≈ R100.
- VAT Input (purchases): A receivable you can claim back; VAT Output (sales): A payable you must remit.

Practical steps
- Record a Sale: Create Invoice → customer, items, price → save → invoice increases Revenue and Receivables.
- Record a Purchase: Create Bill → supplier, items, cost → save → bill increases Expenses and Payables.
- Receive Payment: Open Invoices → mark payment → reduces Receivables, increases Bank.
- Pay Supplier: Open Bills → record payment → reduces Payables, reduces Bank.
- Bank Reconciliation: Match bank entries to transactions → ensures Bank balance agrees with statements.
- VAT Return: Check VAT Input (purchases) and VAT Output (sales) → net = Output − Input → pay or claim.

Reading cash flow
- Operating cash: Cash from daily business (customers paying, supplier bills).
- Investing cash: Buying/selling long-term assets (equipment, software); purchases are cash outflows.
- Financing cash: Borrowing or owner funding; debt inflows, repayments outflows.

Helpful signs
- Receivables up: Customers paying slower → tighten follow-up.
- Payables up: You’re delaying payments → mind supplier relations.
- Inventory up: More cash tied in stock → check turnover.
`;

export const taxQuickTips = `
Tax Quick Tips
- Keep VAT rates accurate per transaction (exclusive vs inclusive).
- Reconcile VAT Input/Output monthly; store all invoices/bills.
- For corporate tax, start from profit, adjust for non-deductibles (e.g., some fines), add allowances (e.g., wear-and-tear) to reach taxable income.
- Maintain schedules: fixed assets, loans, payroll summaries for year-end.
`;
