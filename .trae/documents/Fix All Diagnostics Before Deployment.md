## Vercel Config
- Correct JSON escaping in `vercel.json` rewrite: change `"/((?!.*\.).*)"` (double backslash) to fix the "Invalid escape character" error
- Keep build settings: `buildCommand: npm run build`, `outputDirectory: dist`

## DashboardOverview Types
- Define an `APRow` interface with optional dates and an optional `source` field: `{ id, supplier_name, total_amount, status, bill_date?: string, due_date?: string, source?: string }`
- Update `useState<APRow[]>` and all setters to use this interface
- Normalize PO mapping to set `bill_date: p.po_date || ''` and `due_date: ''` to satisfy usage where strings are expected

## BillsManagement Updates
- Replace `updatePromises: Promise<any>[]` and pushes of `supabase.from('items')...` (which return `PostgrestFilterBuilder`) with sequential `await` calls inside the loop to avoid the Promise typing error
- Alternatively, collect update payloads and run `await Promise.all(updateOps.map(op => op()))` using real Promise-returning functions
- Ensure `items` table supports `cost_price`; see Types section

## PurchaseOrdersManagement Updates
- Apply the same fix as BillsManagement for update batching (use `await` per update or wrap in promise-returning functions)
- Insert payloads may include `cost_price`; ensure types reflect DB (see Types section)

## SalesProducts Form
- Include `cost_price` in `resetForm` initial state: `{ name: "", description: "", unit_price: "", cost_price: "", quantity_on_hand: "" }`
- Ensure `editingProduct` path already sets `cost_price` (it does)

## FixedAssets Form + RPC Typing
- Fix `setFormData` reset to include `funding_source`, `bank_account_id`, `loan_account_id` with defaults
- Add the `post_monthly_depreciation` RPC to Supabase types with return: `{ asset_id: string | null; amount: number; error_message: string | null }[]`
- Update the RPC call to use typed name or cast response to `any[]` when filtering `error_message`

## Loans RPC Typing
- Add `post_monthly_loan_interest` to Supabase types with Args `{ _company_id: string; _posting_date: string }` and Returns `{ loan_id: string | null; interest_amount: number; journal_entry_id: string | null; success: boolean; message: string }[]`
- Replace `supabase.rpc<any>(...)` with either typed call or `supabase.rpc('post_monthly_loan_interest', args)` without generics

## Payroll Profile Query
- Keep `.maybeSingle()` usage and guard: `if (profile?.company_id) setCompanyId(profile.company_id)`
- If linter still complains, cast table name to `any` in `.from("profiles" as any)` and type `profile` as `any` at the assignment point to satisfy the union type

## Supabase Types Updates
- In `src/integrations/supabase/types.ts`:
  - Add `cost_price: number` to `items.Row`, `items.Insert`, `items.Update`
  - Add `post_monthly_depreciation` and `post_monthly_loan_interest` under `Functions` with accurate `Args` and `Returns`

## Verification
- Run TypeScript check locally to confirm no linter errors
- Validate critical flows:
  - Dashboard AP rows render without type errors
  - Bills and PO product sync performs updates/insert without Promise type errors
  - SalesProducts form resets cleanly
  - FixedAssets depreciation button compiles (RPC type OK)
  - Loans interest RPC compiles and toasts correctly
  - Vercel build succeeds; JSON lint error resolved

## Next Step
- If you approve, I will apply these exact changes across the listed files and run a build to verify all diagnostics are cleared before deployment.