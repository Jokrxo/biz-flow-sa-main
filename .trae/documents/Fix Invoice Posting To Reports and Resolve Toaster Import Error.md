## Findings
- Posting is implemented in `src/components/Sales/SalesInvoices.tsx`:
  - `postInvoiceSent(inv)` posts `Dr Debtors (AR)`, `Cr Revenue`, and `Cr VAT` when applicable (SalesInvoices.tsx:377–423).
  - `postInvoicePaid(inv)` posts `Dr Bank`, `Cr Debtors (AR)` (SalesInvoices.tsx:425–470).
  - Both write to `transaction_entries` and `ledger_entries` (SalesInvoices.tsx:362–375).
- Trial balance is built from `ledger_entries` via `trial_balance_live` and loaded by `get_trial_balance_for_company` (FinancialReports.tsx:76–85; supabase/migrations/20251103110503_c26c861a-7504-4ee9-b120-0b6eaae1fc90.sql:54–75).
- Cash Flow RPCs filter `transactions.status = 'posted'` only, so entries with status `"approved"` are excluded (supabase/migrations/20251103080234_a0557a17-6de3-48e1-a864-dcf8209146e1.sql:75–77, 121–124, 142–145, 154–156, 167–169, 209–212).
- The UI error `[plugin:vite:import-analysis] Failed to resolve import "@/components/ui/toaster"` points at `src/App.tsx:3`. The file `src/components/ui/toaster.tsx` exists and `@` alias is configured (vite.config.ts:5–11; tsconfig.app.json:24–27), so this is likely a stale dev-server/alias resolution issue.

## Root Causes
- Invoice transactions are inserted with `status: "approved"` (SalesInvoices.tsx:404 and :448), which the Cash Flow RPC ignores; financial reports that depend on RPC outputs will miss sent/paid postings.
- Posting can silently skip if required accounts are missing: AR, Revenue, Bank, VAT (SalesInvoices.tsx:391–394, 433–435).
- Vite alias resolution likely not picked up by the running dev server, causing the `@/components/ui/toaster` import to fail in `src/App.tsx:3` despite the file existing.

## Plan
1. Update invoice transaction status to `"posted"`
   - In `postInvoiceSent`, change `status: "approved"` to `status: "posted"` (SalesInvoices.tsx:404).
   - In `postInvoicePaid`, change `status: "approved"` to `status: "posted"` (SalesInvoices.tsx:448).
   - This aligns with Cash Flow RPC filters so sent/paid postings appear across all reports.
2. Strengthen account mapping validations
   - Keep current fallbacks but surface a clear toast if AR/Revenue/Bank/VAT accounts are missing and block posting (already present), then guide to add accounts or run the default CoA initializer (supabase function `initialize_company_coa` exists in 20251103080234_a0557a17...sql:2–33).
   - Verify AR’s `account_type = 'Asset'` and codes like `1200` so Debtors shows under Current Assets; Bank is `Asset` (codes `1000/1100`).
3. Ensure trial balance refresh remains in place
   - Keep `refresh_afs_cache` calls after posting (SalesInvoices.tsx:419, 466) to refresh `trial_balance_live` so TB shows `Dr Debtors/Bank` and `Cr Revenue` per status.
4. Fix the Toaster import resolution
   - Replace `import { Toaster } from "@/components/ui/toaster"` with `import { Toaster } from "./components/ui/toaster"` in `src/App.tsx:3` to bypass alias resolution.
   - Alternatively, restart the dev server to reload `vite.config.ts` alias, and optionally set `server.hmr.overlay = false` to prevent blocking overlay.
   - Confirm other `@/...` imports resolve; if not, the alias is not being applied and we’ll normalize imports to relative paths or investigate Vite startup root.
5. Verify end-to-end
   - Create a test invoice → set status to `sent` → confirm TB shows `Dr Debtors`, `Cr Revenue`, `Cr VAT`.
   - Post a payment → confirm TB shows `Dr Bank`, `Cr Debtors`; Cash Flow reflects movement once status is `posted`.

## After Approval
- Apply the code changes in `SalesInvoices.tsx` and `App.tsx` as specified.
- Restart the dev server and validate reports update immediately.
- If any required accounts are missing, initialize or add them and retest.