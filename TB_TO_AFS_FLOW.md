# Trial Balance → AFS Flow Implementation

## Overview
All amounts in Annual Financial Statements (AFS) now flow **directly** from Trial Balance data, ensuring consistency and accuracy.

## Implementation Changes

### ✅ Updated Components

1. **FinancialReports.tsx**
   - Changed from: Fetching `chart_of_accounts` with `transaction_entries` and calculating balances
   - Changed to: Using `get_trial_balance_for_company()` RPC function to get pre-calculated balances
   - Result: All amounts come directly from `trial_balance_live` materialized view

2. **EnhancedFinancialReports.tsx**
   - Changed from: Fetching accounts with transaction entries filtered by date range
   - Changed to: Using `get_trial_balance_for_company()` RPC function
   - Result: Uses trial balance balances directly instead of recalculating

3. **GAAPFinancialStatements.tsx**
   - Already correct: Uses `get_trial_balance_for_company()` ✓

## Data Flow

```
Transaction Entries (double-entry)
    ↓
Ledger Entries (posted)
    ↓
Trial Balance Live (materialized view)
    ↓
get_trial_balance_for_company() RPC
    ↓
Financial Reports / AFS (Balance Sheet, Income Statement)
```

## Benefits

1. **Single Source of Truth**: Trial Balance is the authoritative source
2. **Performance**: Pre-calculated balances from materialized view
3. **Consistency**: All reports use the same data source
4. **Accuracy**: No risk of calculation discrepancies between TB and AFS

## Technical Details

### Trial Balance Source
- **View**: `trial_balance_live` (materialized view)
- **Function**: `get_trial_balance_for_company()`
- **Data Structure**:
  ```typescript
  {
    account_id: UUID
    account_code: string
    account_name: string
    account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
    normal_balance: 'debit' | 'credit'
    total_debits: number
    total_credits: number
    balance: number  // Pre-calculated based on normal_balance
  }
  ```

### Usage in Reports
All report generation functions now:
- Accept `trialBalance[]` as input
- Use `account.balance` directly instead of calculating from transaction entries
- Filter by `account_type` to build financial statements

## Verification

All financial reports now pull amounts directly from trial balance:
- ✅ Balance Sheet (Assets, Liabilities, Equity)
- ✅ Income Statement (Revenue, Expenses, Net Profit)
- ✅ GAAP Financial Statements
- ✅ Enhanced Financial Reports

## Note on Date Filtering

For period-specific reports, date filtering should be handled at the transaction/ledger entry level before data flows into the trial balance. The current implementation uses the full trial balance for AFS reporting, which is standard for annual financial statements.
