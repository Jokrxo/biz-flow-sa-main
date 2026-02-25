## Goal

Ensure that assets added via Transactions are automatically recognized as fixed assets and appear in the Fixed Assets module.

## Detection & Rules

* Transaction-based detection:

  * transaction\_type = 'asset' OR

  * any entry posts to a Fixed Asset account (chart\_of\_accounts.account\_type = 'asset' or account\_code in a configured list like '1500', '1600').

* Company-scoped: always use profiles.company\_id to filter and insert.

* Required transaction fields for asset posting:

  * asset\_name (from description or explicit field), acquisition\_date (transaction\_date), cost (total\_amount), asset\_account\_id, optional supplier/reference.

## Insert & Linking

* On posting/approval of such transactions:

  * Insert a fixed\_assets row (or your existing assets table) with: company\_id, asset\_name, acquisition\_date, cost, account\_id, transaction\_id, status = 'active'.

  * If module supports depreciation: set default depreciation\_method (e.g., straight\_line) and useful\_life (configurable), leave accumulated\_depreciation = 0.

* Link back:

  * Store transaction\_id in fixed\_assets for traceability.

  * Optionally store fixed\_asset\_id in transactions for quick navigation.

## Validation in Transaction Forms

* When selecting 'Asset Purchase' element:

  * Require asset\_name, asset\_account selection (Fixed Asset ledger account), and acquisition\_date.

  * Block posting if missing; show clear error toast.

* Ensure bank account validation stays intact for payment methods.

## Purchase/Bill Integration (Optional Next)

* If a bill or PO item references a fixed asset category, mirror the same insert into fixed\_assets upon Sent/Recorded.

## Realtime & Backfill

* Realtime: subscribe to transactions; when an asset transaction is posted/approved, append fixed asset.

* Backfill utility: scan past posted asset transactions and insert missing fixed assets to ensure module completeness.

## UI Confirmation

* Fixed Assets page: list includes newly added asset with acquisition\_date and cost; clicking opens detail.

* Add a badge ‘Linked Transaction’ with reference\_number.

## Implementation Steps

1. Add detection logic in transaction posting flow (approved/posted events).
2. Insert fixed asset record with mapped fields and link transaction\_id.
3. Add validation prompts in the Asset Purchase transaction form.
4. Wire realtime subscription to update Fixed Assets list.
5. Provide a backfill function to sync historical asset purchases.

## Acceptance Criteria

* Creating/approving an asset purchase transaction automatically adds the fixed asset to the Fixed Assets module.

* Missing required fields prevent posting with clear messages.

* Newly inserted assets are visible immediately in Fixed Assets and link back to their transaction.

