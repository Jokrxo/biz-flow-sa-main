## Summary
I will enforce non-deletable core accounts (Cash, Bank, Debtors/AR, Sales Revenue) at the database level and surface protections in the app. I will also add a small "Post" dialog when marking an invoice as Sent (to choose posting date) and enhance the Paid dialog to select a Bank account and validate it against the Bank module. Posting will use the database trigger path so entries flow into the ledger and trial balance.

## Database Protections
1. Create/confirm `chart_of_accounts.is_protected` and populate for codes `1000`, `1100`, `1200`, `4000` per company.
2. Add a BEFORE DELETE trigger that blocks deletion when `is_protected = true`.
3. Adjust RLS policies to explicitly restrict DELETE on `chart_of_accounts`:
   - Drop broad FOR ALL manage policy.
   - Add separate policies for SELECT/INSERT/UPDATE (admin/accountant allowed) and a strict DELETE policy: only allow delete where `NOT is_protected`.
4. Keep referential integrity: existing FKs from `ledger_entries` and `transaction_entries` already prevent deleting in-use accounts.

## Core Account Initialization
1. RPC `ensure_core_accounts(_company_id)` upserts the required accounts with `is_protected = true`.
2. Call this RPC before loading accounts in posting flows (already wired in SalesInvoices).

## Invoice Posting UX Changes
1. Sent Posting Dialog:
   - When selecting status "sent", open a small dialog (like Paid) with a date field and a "Post" button.
   - On confirm: set invoice status to `sent`, set `sent_at`, and post entries using the chosen date: `Dr Debtors`, `Cr Revenue`, `Cr VAT` (+refresh trial balance cache).
2. Paid Posting Dialog Enhancements:
   - Add a Bank account select populated from `bank_accounts` for the company.
   - Require a valid bank selection and payment amount; validate against outstanding.
   - Post using selected bank: `Dr Bank`, `Cr Debtors`; update `amount_paid`, set status to `paid` if settled, set `paid_at`.

## Posting Order & Reporting
1. Create transactions with `status: "draft"`, insert `transaction_entries`, then update to `status: "posted"` (trigger posts into `ledger_entries`).
2. Refresh the materialized trial balance view after posting; financial reports read from this view.

## App Safeguards (UI)
1. Where accounts are managed (CoA screen), disable/hide the Delete action for `is_protected` accounts and show a lock indicator.
2. In case of direct API delete calls, the DB trigger still blocks protected accounts.

## Verification
1. Create an invoice → Sent dialog → choose date → post. Check Balance Sheet shows Debtors increase and Income Statement shows Revenue.
2. Pay invoice → choose Bank and date → post. Check Debtors decreases, Bank increases, Cash Flow includes the movement.
3. Attempt to delete `1200 AR` or `4000 Revenue`: UI blocks; direct delete returns DB error.

## Implementation Files
- Supabase migrations: add DELETE RLS policy changes and confirm trigger.
- SalesInvoices.tsx: add Sent dialog state and UI, load bank accounts in Paid dialog, validations, and parameterized posting functions.
- CoA management UI (where applicable): respect `is_protected` for Delete/visibility.

## Next Step
I will implement these changes immediately, then verify posting and protections end-to-end with the running dev server.