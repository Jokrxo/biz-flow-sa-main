## Direction
- Stop all Git pushes until you explicitly ask.
- Keep your system intact; make the smallest safe changes.

## Goal
- When a user posts a manual transaction from the form, set the transaction `status` to `approved` immediately.
- CSV/imported transactions must remain `pending` for manual approval.
- Prevent the “transaction has no transaction entry” error by not advancing to `posted` until entries exist.

## Changes (Targeted)
### 1) TransactionForm.tsx
- On header insert, set `status: "approved"` (currently `pending` or varied).
- Insert `transaction_entries` immediately with `status: "approved"`.
- Remove any `update({ status: 'posted' })` called before entries are created; keep the transaction at `approved`.
- Keep existing ledger mirroring only if your reports depend on it and it runs after entry insert; otherwise, skip ledger syncing to match the “approve only” rule.

### 2) TransactionFormEnhanced.tsx
- On header insert, set `status: "approved"`.
- Insert `transaction_entries` with `status: "approved"`.
- Remove any code that updates transaction to `posted` before entries exist.
- Ensure ledger mirroring (if required) happens strictly after successful entry insert; otherwise leave the transaction at `approved` without ledger writes.

### 3) CSV/Import Flows
- Confirm importer pathways (CSV or bulk import) set header `status: "pending"`.
- No change to CSV: users must manually approve afterwards.

### 4) Remove Risky Path
- Do not use the new RPC for manual posting.
- Keep your original posting flow; only tweak header `status` and ordering to eliminate the orphan transaction error.

## Verification
- Post a manual transaction (expense/income) and observe header becomes `approved` immediately.
- Confirm no “has no transaction entry” errors: entries exist first, then status is set (or remains) `approved`.
- Try a CSV import: header remains `pending` and requires manual approval.

## Deployment
- No Git push until you instruct.
- I will apply these code edits locally and validate in dev server; then await your instruction before pushing.

## Notes
- These are minimal, safe edits focused on status handling and ordering; your system logic remains intact.
- If you prefer to skip ledger posting entirely on manual approve, I will remove those lines in both forms to avoid side effects.