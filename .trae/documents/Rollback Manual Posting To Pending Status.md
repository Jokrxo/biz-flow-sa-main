## Goal
Restore manual transaction behavior to your previous working state: when posting manually, set transaction status to "pending" (not approved/posted). CSV/imported transactions remain pending.

## Changes
- TransactionForm.tsx: set header insert `status: "pending"`; set inserted `transaction_entries` `status: "pending"`; do not change any other logic.
- TransactionFormEnhanced.tsx: set header insert `status: "pending"`; set inserted `transaction_entries` `status: "pending"`; keep ledger sync as-is; do not set `posted`.

## No Git Push
- I will not push any changes to GitHub until you explicitly request.

## Verification
- Post a manual transaction and confirm its status shows "pending"; entries exist; no "has no transaction entry" message.

## Next
- If you later want auto-approve again, we can revisit with a safer ordering that won’t trigger orphan header errors.