## Goal
Ensure that assets added via Transactions are automatically recognized as fixed assets and appear in the Fixed Assets module.

## Detection & Rules
- Transaction-based detection:
  - transaction_type = 'asset' OR
  - any entry posts to a Fixed Asset account (chart_of_accounts.account_type = 'asset' or account_code in a configured list like '1500', '1600').
- Company-scoped: always use profiles.company_id to filter and insert.
- Required transaction fields for asset posting:
  - asset_name (from description or explicit field), acquisition_date (transaction_date), cost (total_amount), asset_account_id, optional supplier/reference.

## Insert & Linking
- On posting/approval of such transactions:
  - Insert a fixed_assets row (or your existing assets table) with: company_id, asset_name, acquisition_date, cost, account_id, transaction_id, status = 'active'.
  - If module supports depreciation: set default depreciation_method (e.g., straight_line) and useful_life (configurable), leave accumulated_depreciation = 0.
- Link back:
  - Store transaction_id in fixed_assets for traceability.
  - Optionally store fixed_asset_id in transactions for quick navigation.

## Validation in Transaction Forms
- When selecting 'Asset Purchase' element:
  - Require asset_name, asset_account selection (Fixed Asset ledger account), and acquisition_date.
  - Block posting if missing; show clear error toast.
- Ensure bank account validation stays intact for payment methods.

## Purchase/Bill Integration (Optional Next)
- If a bill or PO item references a fixed asset category, mirror the same insert into fixed_assets upon Sent/Recorded.

## Realtime & Backfill
- Realtime: subscribe to transactions; when an asset transaction is posted/approved, append fixed asset.
- Backfill utility: scan past posted asset transactions and insert missing fixed assets to ensure module completeness.

## UI Confirmation
- Fixed Assets page: list includes newly added asset with acquisition_date and cost; clicking opens detail.
- Add a badge ‘Linked Transaction’ with reference_number.

## Implementation Steps
1. Add detection logic in transaction posting flow (approved/posted events).
2. Insert fixed asset record with mapped fields and link transaction_id.
3. Add validation prompts in the Asset Purchase transaction form.
4. Wire realtime subscription to update Fixed Assets list.
5. Provide a backfill function to sync historical asset purchases.

## Acceptance Criteria
- Creating/approving an asset purchase transaction automatically adds the fixed asset to the Fixed Assets module.
- Missing required fields prevent posting with clear messages.
- Newly inserted assets are visible immediately in Fixed Assets and link back to their transaction.