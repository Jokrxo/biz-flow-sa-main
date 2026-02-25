-- Create purchase orders tables
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  po_number text not null,
  po_date date not null,
  status text not null default 'draft',
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  notes text,
  branch_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  tax_rate numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- Policies similar to invoices
create policy "Accountants and administrators can manage purchase orders"
  on public.purchase_orders for all using (
    has_role(auth.uid(), 'administrator'::app_role, company_id) or has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

create policy "Users can view purchase orders in their company"
  on public.purchase_orders for select using (
    company_id = get_user_company(auth.uid())
  );

create policy "Accountants and administrators can manage purchase order items"
  on public.purchase_order_items for all using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = purchase_order_id and (
        has_role(auth.uid(), 'administrator'::app_role, po.company_id) or has_role(auth.uid(), 'accountant'::app_role, po.company_id)
      )
    )
  );

create policy "Users can view purchase order items in their company"
  on public.purchase_order_items for select using (
    exists (
      select 1 from public.purchase_orders po
      where po.id = purchase_order_id and po.company_id = get_user_company(auth.uid())
    )
  );

-- Indexes
create index idx_purchase_orders_company on public.purchase_orders(company_id);
create index idx_purchase_orders_supplier on public.purchase_orders(supplier_id);
create index idx_purchase_order_items_po on public.purchase_order_items(purchase_order_id);
