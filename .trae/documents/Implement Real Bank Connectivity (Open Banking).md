## Goal
Replace the prototype bank with a real, secure connection to your bank(s), ingest balances and transactions automatically, and reconcile into your ledger.

## Approach
- Provider-agnostic integration with first rollout for South Africa using Stitch (best ZA coverage). Pluggable adapters for other regions (Plaid US/EU, TrueLayer UK/EU, Salt Edge global).
- Start read-only (accounts, balances, transactions) to keep risk low; add payments later if needed.

## Architecture
- UI: "Connect Bank" flow in the Bank module
  - Provider select → OAuth (PKCE) redirect
  - Success screen shows linked accounts, last sync time, and manual refresh
  - Status badges: Connected, Needs Reauth, Sync Error
- Backend/API
  - OAuth callback endpoint exchanges the authorization code → access/refresh token
  - Store tokens in a secure vault table (encrypted at rest, rotated keys)
  - Webhook receiver for transaction updates (new/changed); queues ingestion
  - Scheduled sync fallback (e.g., daily) to backfill if webhooks miss
- Sync service
  - Initial import: accounts + 24 months of transactions
  - Incremental: delta since last cursor
  - Dedupe by provider transaction id + posted_at + amount
  - Robust retry & rate-limit compliance

## Data Model
- `bank_connections` (id, company_id, provider, connection_state, created_at, updated_at)
- `bank_linked_accounts` (id, company_id, connection_id, provider_account_id, bank_name, account_name, account_number_masked, currency, type, current_balance, last_sync_at)
- `bank_transactions` (id, company_id, provider_tx_id, account_id, amount, currency, posted_at, description, merchant, category, running_balance, raw_json)
- Relations to existing `bank_accounts` for ledger posting (map linked accounts to your internal ledger account)

## Reconciliation & Rules
- Auto-categorize with a lightweight rules engine (merchant/name/amount patterns → account mapping)
- Review queue in UI: Accept, Split, Ignore, Reclassify
- Post approved transactions to double-entry journal: Bank ↔ Income/Expense/AR/AP
- Matching engine for AR/AP: auto-match to unpaid invoices/bills by amount/date tolerance

## Security
- OAuth with PKCE; no credentials stored
- Token encryption (AES-256-GCM) + KMS-managed key; rotate keys
- Strict audit logs for connect, sync, post events
- Secrets in environment variables; never committed to repo

## UI Enhancements
- Bank module: Connect button, list of linked accounts, per-account sync controls
- Filters: date range, amount, category, status (Unreviewed/Posted)
- Clear empty states and error recovery actions

## Provider SDKs & Config
- Stitch SDK (ZA): accounts, balances, transactions; webhooks
- Abstraction layer: `BankProvider` interface (connect, exchangeCode, listAccounts, getTransactions, webhookHandler)
- Env vars: `PROVIDER=stitch`, `STITCH_CLIENT_ID`, `STITCH_SECRET`, `STITCH_WEBHOOK_SECRET`, callback URL

## Rollout Plan
1. Scaffold provider-agnostic layer and Stitch adapter (sandbox first)
2. Create vault tables and encryption utilities
3. Implement OAuth flow and callback endpoint; link UI
4. Build ingestion pipeline and webhook receiver
5. UI review queue and posting to ledger
6. Matching rules for AR/AP; manual override UX
7. Production readiness: rate limits, retries, observability

## Testing
- Sandbox banks: connect, fetch accounts/transactions, webhook simulation
- E2E tests for OAuth, ingestion, reconciliation
- Data correctness checks: balances match provider, no dupes

## Acceptance Criteria
- Real bank connection established (Stitch) and visible in the Bank module
- Automatic ingestion of balances and transactions, with daily sync and webhook updates
- Transactions review and posting into the ledger; AR/AP matching works
- Secure token storage, no secrets in code, clean builds, and no runtime errors