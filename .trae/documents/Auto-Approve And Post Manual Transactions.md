## Goal
Make manual transactions immediately approved and posted to journal (transaction_entries), ledger, AFS cache, and reflected in Trial Balance without extra steps.

## Current State
- TransactionForm posts header with `status: approved` then inserts entries, mirrors to `ledger_entries`, calls `refresh_afs_cache`.
- TransactionFormEnhanced posts header with `status: pending`, inserts entries, sets transaction to `approved`, mirrors to ledger, calls `refresh_afs_cache`.
- Entries are saved with `status: pending` in several paths; transaction status varies between `approved` and `posted` elsewhere.

## Changes (DB-side — robust and atomic)
1. Create RPC `post_manual_transaction(_company_id uuid, _transaction jsonb, _entries jsonb[])`:
- Inserts the transaction header with `status: approved`.
- Validates debits == credits and account IDs.
- Inserts `transaction_entries` with `status: approved`.
- Mirrors entries to `ledger_entries` (same amounts, description, date).
- Updates transaction `status` to `posted`.
- Calls `refresh_afs_cache(_company_id)`.
- Returns `{transaction_id, posted_entries_count}`.

2. Add trigger `AFTER INSERT ON transaction_entries`:
- When both sides exist for a transaction and header status is `approved`, auto-mirror the new entries into `ledger_entries` and set transaction status to `posted`.
- Guards against re-posting; idempotent via unique constraint on `(transaction_id, account_id)` in ledger.

3. Optionally add trigger `AFTER DELETE/UPDATE ON transaction_entries`:
- Keep ledger rows in sync; on change or remove, update ledger and mark transaction `status` back to `pending` until balanced again.

## Changes (Frontend — keep UX consistent)
1. TransactionForm.tsx
- Insert via new RPC instead of multi-step client posting.
- Keep validations and bank balance update; set entries’ `status: approved`.

2. TransactionFormEnhanced.tsx
- Same as above: call RPC with prepared header + entries (including VAT split when applicable).
- Remove manual ledger mirroring code when using RPC.

3. Status harmonization
- Use `posted` for fully posted transactions; set entries to `approved`.
- Continue calling `update_bank_balance` RPC if a bank account is involved.

## Validation & Safety
- Use existing `validate_transaction_before_post` RPC pre-check.
- Ensure debits equal credits > 0.
- Ensure account IDs exist and belong to the same company.

## Permissions & RLS
- Grant EXECUTE on the new RPC to `authenticated`.
- Ensure RLS policies for `transactions`, `transaction_entries`, and `ledger_entries` permit inserts for the user’s company.

## Verification
- Post sample manual transactions (income, expense, asset purchase, loan flows) and confirm:
  - Transaction status becomes `posted` immediately.
  - Entries are in `transaction_entries` with `status: approved`.
  - Matching rows exist in `ledger_entries`.
  - AFS/TB reflect the change (AFS refreshed; TB reads from ledger).

## Rollout
- Implement RPC and triggers via migrations.
- Update both transaction forms to call the RPC.
- Run a build and smoke tests.

## Next Step
If you approve, I will implement the RPC and triggers, update both forms to use them, harmonize statuses, and verify posting end-to-end.