## Overview
- Create an Accounts Payable (AP) Dashboard in Purchase, mirroring the AR Dashboard’s UX but focused on suppliers, bills and purchase orders.
- Provide KPIs, aging, top-supplier bars, and an unpaid-percentage donut, all computed from purchase data.

## Data Sources
- Bills: `public.bills` and `public.bill_items` — use `bill_date`, `due_date`, `total_amount`, `status`, `supplier_id`.
- Purchase Orders: `public.purchase_orders` and `public.purchase_order_items` — use `po_date`, `total_amount`, `status`, `supplier_id`.
- Payments: `public.transactions` — filter `transaction_type='payment'`, `status='posted'`, and `reference_number=po_number` to reduce PO outstanding; also support bill payments if reference_number=bill_number.
- Suppliers: `public.suppliers` — names for display and filtering.

## KPIs
- Unpaid payables total: sum of outstanding across selected source(s).
- Overdue total: bills with `due_date < today` and status not `paid`.
- Overdue 1–30, 31–60, 61–90, 90+: bucket by days past due (bills only; POs without due_date treated as current).

## Charts & Tables
- Top 10 Suppliers (bar vertical): sum outstanding per supplier.
- Unpaid percentage by supplier (donut): outstanding distribution across suppliers.
- AP Aging Summary (table): columns Current, 1–30, 31–60, 61–90, 91+, Amount due per supplier.
- Unpaid items (table): supplier, document number (bill or PO), date, due date (if any), outstanding amount.

## Filters & Controls
- Date range: start/end (end pinned to today) applied to `bill_date` and `po_date`.
- Supplier filter: All suppliers or a specific supplier.
- Source scope: `Bills`, `Purchase Orders`, or `All` (union with normalized fields).
- Status scope: `Sent & Overdue` vs `Include Draft` (for PO, use `status in ('sent','paid')`; for Bills, anything not `paid`).

## Normalization Logic
- Bills row: `supplier_name`, `doc_no=bill_number`, `date=bill_date`, `due_date`, `outstanding = status==='paid'?0:total_amount`.
- PO row: `supplier_name`, `doc_no=po_number`, `date=po_date`, `due_date=null`, `outstanding = total_amount - sum(payments where reference_number=po_number and posted)`.
- Combine rows per filter scope, then aggregate for KPIs/charts.

## Real-time Updates
- Subscribe to changes on `bills`, `purchase_orders`, and `transactions` to refresh dashboard when data changes.

## UI Integration
- Add a new tab `AP Dashboard` under Purchase.
- Component: `src/components/Purchase/APDashboard.tsx` (mirrors `Sales/ARDashboard.tsx` structure and styling).
- Wire tab into `src/pages/Purchase.tsx` with `TabsTrigger value="ap-dashboard"` and `TabsContent` rendering the component.

## Technical Notes
- Use supabase client queries consistent with existing patterns (profiles → company_id, then filtered selects).
- Ensure number formatting in ZAR (`toLocaleString('en-ZA')`) consistent with AR.
- Guard no-data states with informative cards; keep ResponsiveContainer children single.
- Performance: batch queries and use maps for supplier totals; memoize derived arrays.

## Edge Cases
- Missing `due_date` on PO: treat as current bucket.
- Partial payments: handled by transactions sum; outstanding never negative.
- Suppliers without name: fallback to "Unknown".
- Multi-company safety: always filter by `company_id` from profile.

## Milestones
1. Scaffold component with filters, queries, and normalization.
2. Implement KPIs and top-supplier bar + donut.
3. Build aging summary and unpaid items table.
4. Add realtime channels and integrate Purchase tab.
5. Validate with test data and adjust buckets/formatting.

## Confirmation
- On approval, I will implement `APDashboard` with the above behavior and wire it into Purchase.