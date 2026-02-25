## Overview
Implement real bank connectivity using a provider-agnostic layer with first rollout via Stitch (ZA). Support secure OAuth, token storage, automated transaction ingestion (webhooks + scheduled sync), and ledger reconciliation.

## Phase 1: Foundations
- Data model: create `bank_connections`, `bank_linked_accounts`, `bank_transactions` tables (encrypted fields where needed).
- Provider abstraction: `BankProvider` interface (connect, exchangeCode, listAccounts, getTransactions, handleWebhook).
- Choose provider: Stitch (ZA) adapter with sandbox keys via env vars.

## Phase 2: Auth & Linking
- UI: “Connect Bank” flow in Bank module with provider picker.
- OAuth (PKCE): redirect, callback handler, token exchange.
- Secure token vault: encrypt access/refresh tokens at rest, rotate keys.
- Store linked accounts and initial balances; show status badges (Connected/Needs Reauth/Sync Error).

## Phase 3: Ingestion & Sync
- Initial import: last 24 months transactions per account.
- Incremental sync: delta by provider cursor; scheduled daily job.
- Webhook receiver: process new/updated transactions; queue + retry handling.
- Dedupe: provider_tx_id + posted_at + amount.

## Phase 4: Review & Posting
- Review queue UI: filter by status/date/category; actions: Accept, Split, Ignore, Reclassify.
- Rules engine: auto-categorize by merchant/description/amount; user-defined rules.
- Posting: create double-entry journal entries (Bank ↔ Income/Expense/AR/AP) on approval.
- Matching engine: auto-match payments to invoices/bills (amount/date tolerance), manual override.

## Phase 5: Observability & Security
- Logs/audits: connect, sync, post events; error dashboards.
- Rate limits & retries; backoff strategies.
- Secrets via env; no keys in repo.

## Deliverables
- Live bank connection (Stitch) visible in UI; accounts and balances synced.
- Transactions ingest automatically (webhooks + daily sync).
- Review and post into ledger; AR/AP matching operational.
- Clean builds; no runtime errors; secure storage & audit.

## Timeline
- Week 1: Foundations + OAuth/linking.
- Week 2: Ingestion + webhooks + scheduled sync.
- Week 3: Review/Posting + rules/matching.
- Week 4: Hardening, observability, documentation.

## Acceptance Criteria
- Connect bank → see linked accounts, balances, last sync.
- Transactions appear continuously; duplicates prevented.
- Reviewed transactions post correctly; AR/AP matches reduce outstanding.
- Tokens encrypted; secrets only in env; logs present for key events.