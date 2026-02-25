export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_categories: {
        Row: {
          account_id: string
          category_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          account_id: string
          category_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          account_id?: string
          category_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_categories_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_categories_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          company_id: string
          created_at: string
          currency: string | null
          current_balance: number
          id: string
          opening_balance: number
          status: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          company_id: string
          created_at?: string
          currency?: string | null
          current_balance?: number
          id?: string
          opening_balance?: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          company_id?: string
          created_at?: string
          currency?: string | null
          current_balance?: number
          id?: string
          opening_balance?: number
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bill_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string | null
          description: string
          id: string
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          bill_id: string
          created_at?: string | null
          description: string
          id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string | null
          description?: string
          id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string
          bill_number: string
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_date: string
          bill_number: string
          company_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          category: string | null
          company_id: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          company_id: string
          created_at: string
          end_date: string
          id: string
          period_name: string
          period_type: string
          start_date: string
          status: string
          total_actual: number
          total_budget: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          period_name: string
          period_type: string
          start_date: string
          status?: string
          total_actual?: number
          total_budget?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          period_name?: string
          period_type?: string
          start_date?: string
          status?: string
          total_actual?: number
          total_budget?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          actual_amount: number
          budget_month: number | null
          budget_name: string
          budget_year: number
          budgeted_amount: number
          category: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string
          variance: number
        }
        Insert: {
          actual_amount?: number
          budget_month?: number | null
          budget_name: string
          budget_year: number
          budgeted_amount?: number
          category: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
          variance?: number
        }
        Update: {
          actual_amount?: number
          budget_month?: number | null
          budget_name?: string
          budget_year?: number
          budgeted_amount?: number
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_exempt_income: boolean | null
          is_system: boolean | null
          is_tax_deductible: boolean | null
          is_vat_applicable: boolean | null
          normal_balance: string | null
          parent_account_id: string | null
          updated_at: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_exempt_income?: boolean | null
          is_system?: boolean | null
          is_tax_deductible?: boolean | null
          is_vat_applicable?: boolean | null
          normal_balance?: string | null
          parent_account_id?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_exempt_income?: boolean | null
          is_system?: boolean | null
          is_tax_deductible?: boolean | null
          is_vat_applicable?: boolean | null
          normal_balance?: string | null
          parent_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_summary"
            referencedColumns: ["account_id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          business_type: string | null
          code: string
          created_at: string
          default_currency: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          tax_number: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          code: string
          created_at?: string
          default_currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          code?: string
          created_at?: string
          default_currency?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          category: string | null
          company_id: string
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          company_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          company_id: string
          created_at: string
          description: string
          expense_date: string
          id: string
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          company_id: string
          created_at?: string
          description: string
          expense_date: string
          id?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          company_id: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          report_data: Json
          report_name: string
          report_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          report_data: Json
          report_name: string
          report_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          report_data?: Json
          report_name?: string
          report_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          asset_type: string | null
          branch_id: string | null
          company_id: string
          cost: number
          created_at: string | null
          description: string
          disposal_date: string | null
          id: string
          purchase_date: string
          status: string | null
          tax_usage_start_date: string | null
          updated_at: string | null
          useful_life_years: number
          wear_and_tear_rate: number | null
        }
        Insert: {
          accumulated_depreciation?: number
          asset_type?: string | null
          branch_id?: string | null
          company_id: string
          cost?: number
          created_at?: string | null
          description: string
          disposal_date?: string | null
          id?: string
          purchase_date: string
          status?: string | null
          tax_usage_start_date?: string | null
          updated_at?: string | null
          useful_life_years?: number
          wear_and_tear_rate?: number | null
        }
        Update: {
          accumulated_depreciation?: number
          asset_type?: string | null
          branch_id?: string | null
          company_id?: string
          cost?: number
          created_at?: string | null
          description?: string
          disposal_date?: string | null
          id?: string
          purchase_date?: string
          status?: string | null
          tax_usage_start_date?: string | null
          updated_at?: string | null
          useful_life_years?: number
          wear_and_tear_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          item_type: string | null
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description: string
          id?: string
          invoice_id: string
          item_type?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          item_type?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          quote_id: string | null
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          quote_id?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          quote_id?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          item_type: string | null
          name: string
          quantity_on_hand: number
          unit_price: number
          cost_price: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          item_type?: string | null
          name: string
          quantity_on_hand?: number
          unit_price?: number
          cost_price?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          item_type?: string | null
          name?: string
          quantity_on_hand?: number
          unit_price?: number
          cost_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          audit_notes: string | null
          company_id: string
          created_at: string | null
          credit: number
          debit: number
          description: string
          entry_date: string
          entry_type: string
          id: string
          is_reversed: boolean | null
          posted_at: string | null
          posted_by: string | null
          reference_id: string
          reversed_at: string | null
          reversed_by: string | null
          transaction_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          audit_notes?: string | null
          company_id: string
          created_at?: string | null
          credit?: number
          debit?: number
          description: string
          entry_date: string
          entry_type?: string
          id?: string
          is_reversed?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id: string
          reversed_at?: string | null
          reversed_by?: string | null
          transaction_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          audit_notes?: string | null
          company_id?: string
          created_at?: string | null
          credit?: number
          debit?: number
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          is_reversed?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference_id?: string
          reversed_at?: string | null
          reversed_by?: string | null
          transaction_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          id: string
          license_key: string
          plan_type: string
          status: string
          expiry_date: string | null
          assigned_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          license_key: string
          plan_type?: string
          status?: string
          expiry_date?: string | null
          assigned_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          license_key?: string
          plan_type?: string
          status?: string
          expiry_date?: string | null
          assigned_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          branch_id: string | null
          company_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          role: string | null
          updated_at: string
          user_id: string
          subscription_status: string | null
          plan: string | null
          subscription_expiry: string | null
          license_key: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id: string
          subscription_status?: string | null
          plan?: string | null
          subscription_expiry?: string | null
          license_key?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
          subscription_status?: string | null
          plan?: string | null
          subscription_expiry?: string | null
          license_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          purchase_order_id: string
          quantity: number
          tax_rate: number
          unit_price: number
          expense_account_id?: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description: string
          id?: string
          purchase_order_id: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
          expense_account_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          purchase_order_id?: string
          quantity?: number
          tax_rate?: number
          unit_price?: number
          expense_account_id?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string | null
          id: string
          notes: string | null
          po_date: string
          po_number: string
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          po_date: string
          po_number: string
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          po_date?: string
          po_number?: string
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          id: string
          quantity: number
          quote_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description: string
          id?: string
          quantity?: number
          quote_id: string
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          expiry_date: string | null
          id: string
          notes: string | null
          quote_date: string
          quote_number: string
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quote_date: string
          quote_number: string
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          quote_date?: string
          quote_number?: string
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          id: string
          company_id: string
          first_name: string
          last_name: string
          email: string | null
          id_number: string | null
          tax_number: string | null
          bank_name: string | null
          bank_branch_code: string | null
          bank_account_number: string | null
          bank_account_type: string | null
          salary_type: string | null
          uif_covered: boolean | null
          pension_rate: number | null
          medical_aid_amount: number | null
          start_date: string | null
          active: boolean
          created_at: string | null
          position: string | null
          department: string | null
          payroll_number: string | null
          phone: string | null
          address: string | null
          paye_registered: boolean | null
          uif_registered: boolean | null
          medical_aid_members: number | null
        }
        Insert: {
          id?: string
          company_id: string
          first_name: string
          last_name: string
          email?: string | null
          id_number?: string | null
          tax_number?: string | null
          bank_name?: string | null
          bank_branch_code?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          salary_type?: string | null
          uif_covered?: boolean | null
          pension_rate?: number | null
          medical_aid_amount?: number | null
          start_date?: string | null
          active?: boolean
          created_at?: string | null
          position?: string | null
          department?: string | null
          payroll_number?: string | null
          phone?: string | null
          address?: string | null
          paye_registered?: boolean | null
          uif_registered?: boolean | null
          medical_aid_members?: number | null
        }
        Update: {
          id?: string
          company_id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          id_number?: string | null
          tax_number?: string | null
          bank_name?: string | null
          bank_branch_code?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          salary_type?: string | null
          uif_covered?: boolean | null
          pension_rate?: number | null
          medical_aid_amount?: number | null
          start_date?: string | null
          active?: boolean
          created_at?: string | null
          position?: string | null
          department?: string | null
          payroll_number?: string | null
          phone?: string | null
          address?: string | null
          paye_registered?: boolean | null
          uif_registered?: boolean | null
          medical_aid_members?: number | null
        }
        Relationships: []
      }
      pay_items: {
        Row: {
          id: string
          company_id: string
          code: string
          name: string
          type: string
          taxable: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          code: string
          name: string
          type: string
          taxable?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          code?: string
          name?: string
          type?: string
          taxable?: boolean
          created_at?: string | null
        }
        Relationships: []
      }
      employee_pay_items: {
        Row: {
          id: string
          employee_id: string
          pay_item_id: string
          amount: number | null
          rate: number | null
          unit: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          employee_id: string
          pay_item_id: string
          amount?: number | null
          rate?: number | null
          unit?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          employee_id?: string
          pay_item_id?: string
          amount?: number | null
          rate?: number | null
          unit?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      pay_runs: {
        Row: {
          id: string
          company_id: string
          period_start: string
          period_end: string
          status: string
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          period_start: string
          period_end: string
          status?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          period_start?: string
          period_end?: string
          status?: string
          created_at?: string | null
        }
        Relationships: []
      }
      pay_run_lines: {
        Row: {
          id: string
          pay_run_id: string
          employee_id: string
          gross: number
          net: number
          paye: number
          uif_emp: number
          uif_er: number
          sdl_er: number
          details: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          pay_run_id: string
          employee_id: string
          gross?: number
          net?: number
          paye?: number
          uif_emp?: number
          uif_er?: number
          sdl_er?: number
          details?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          pay_run_id?: string
          employee_id?: string
          gross?: number
          net?: number
          paye?: number
          uif_emp?: number
          uif_er?: number
          sdl_er?: number
          details?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      payroll_settings: {
        Row: {
          id: string
          company_id: string
          tax_brackets: Json | null
          pension_rules: Json | null
          uif_percent: number | null
          sdl_percent: number | null
          overtime_rules: Json | null
          allowances: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          tax_brackets?: Json | null
          pension_rules?: Json | null
          uif_percent?: number | null
          sdl_percent?: number | null
          overtime_rules?: Json | null
          allowances?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          tax_brackets?: Json | null
          pension_rules?: Json | null
          uif_percent?: number | null
          sdl_percent?: number | null
          overtime_rules?: Json | null
          allowances?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      payroll_periods: {
        Row: {
          id: string
          company_id: string
          year: number
          month: number
          name: string
          start_date: string
          end_date: string
          status: string
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          year: number
          month: number
          name: string
          start_date: string
          end_date: string
          status?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          year?: number
          month?: number
          name?: string
          start_date?: string
          end_date?: string
          status?: string
          created_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          company_id: string
          theme: string
          date_format: string
          fiscal_year_start: number
          fiscal_default_year: number | null
          fiscal_lock_year: boolean | null
          enable_notifications: boolean
          enable_auto_backup: boolean
          language: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          theme?: string
          date_format?: string
          fiscal_year_start?: number
          fiscal_default_year?: number | null
          fiscal_lock_year?: boolean | null
          enable_notifications?: boolean
          enable_auto_backup?: boolean
          language?: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          theme?: string
          date_format?: string
          fiscal_year_start?: number
          fiscal_default_year?: number | null
          fiscal_lock_year?: boolean | null
          enable_notifications?: boolean
          enable_auto_backup?: boolean
          language?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      loans: {
        Row: {
          id: string
          company_id: string
          reference: string
          loan_type: string
          principal: number
          interest_rate: number
          start_date: string
          term_months: number
          monthly_repayment: number | null
          status: string
          outstanding_balance: number
          created_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          reference: string
          loan_type: string
          principal: number
          interest_rate: number
          start_date: string
          term_months: number
          monthly_repayment?: number | null
          status?: string
          outstanding_balance: number
          created_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          reference?: string
          loan_type?: string
          principal?: number
          interest_rate?: number
          start_date?: string
          term_months?: number
          monthly_repayment?: number | null
          status?: string
          outstanding_balance?: number
          created_at?: string | null
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          id: string
          loan_id: string
          payment_date: string
          amount: number
          principal_component: number
          interest_component: number
          created_at: string | null
        }
        Insert: {
          id?: string
          loan_id: string
          payment_date: string
          amount: number
          principal_component: number
          interest_component: number
          created_at?: string | null
        }
        Update: {
          id?: string
          loan_id?: string
          payment_date?: string
          amount?: number
          principal_component?: number
          interest_component?: number
          created_at?: string | null
        }
        Relationships: []
      }
      sales: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string | null
          customer_name: string
          id: string
          invoice_id: string | null
          sale_date: string
          status: string | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string | null
          customer_name: string
          id?: string
          invoice_id?: string | null
          sale_date: string
          status?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string | null
          customer_name?: string
          id?: string
          invoice_id?: string | null
          sale_date?: string
          status?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_adjustments: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          created_at: string
          description: string
          id: string
          tax_year: number
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          company_id: string
          created_at?: string
          description: string
          id?: string
          tax_year: number
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          tax_year?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_periods: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          paye_total: number | null
          period_end: string
          period_start: string
          period_type: string
          status: string
          submission_date: string | null
          submitted_by: string | null
          updated_at: string | null
          vat_input_total: number | null
          vat_output_total: number | null
          vat_payable: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          paye_total?: number | null
          period_end: string
          period_start: string
          period_type: string
          status?: string
          submission_date?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          vat_input_total?: number | null
          vat_output_total?: number | null
          vat_payable?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          paye_total?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          status?: string
          submission_date?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          vat_input_total?: number | null
          vat_output_total?: number | null
          vat_payable?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_entries: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          status: string | null
          transaction_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          status?: string | null
          transaction_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          status?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transaction_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          bank_account_id: string | null
          base_amount: number | null
          branch_id: string | null
          category: string | null
          company_id: string
          created_at: string
          description: string
          id: string
          reference_number: string | null
          status: string
          tax_period_id: string | null
          total_amount: number
          transaction_date: string
          transaction_type: string | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_inclusive: boolean | null
          vat_rate: number | null
        }
        Insert: {
          bank_account_id?: string | null
          base_amount?: number | null
          branch_id?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          description: string
          id?: string
          reference_number?: string | null
          status?: string
          tax_period_id?: string | null
          total_amount?: number
          transaction_date: string
          transaction_type?: string | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vat_inclusive?: boolean | null
          vat_rate?: number | null
        }
        Update: {
          bank_account_id?: string | null
          base_amount?: number | null
          branch_id?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          reference_number?: string | null
          status?: string
          tax_period_id?: string | null
          total_amount?: number
          transaction_date?: string
          transaction_type?: string | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vat_inclusive?: boolean | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tax_period_id_fkey"
            columns: ["tax_period_id"]
            isOneToOne: false
            referencedRelation: "tax_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balances: {
        Row: {
          account_code: string
          account_name: string
          company_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          period_end: string | null
          period_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          company_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          company_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      trial_balance_live: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          balance: number | null
          company_id: string | null
          normal_balance: string | null
          total_credits: number | null
          total_debits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balance_summary: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          balance: number | null
          company_id: string | null
          normal_balance: string | null
          total_credits: number | null
          total_debits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_classify_transaction: {
        Args: { _description: string }
        Returns: {
          category: string
          transaction_type: string
        }[]
      }
      calculate_vat_amounts: {
        Args: {
          _total_amount: number
          _vat_inclusive: boolean
          _vat_rate: number
        }
        Returns: {
          base_amount: number
          total_amount: number
          vat_amount: number
        }[]
      }
      check_duplicate_transaction: {
        Args: {
          _bank_account_id: string
          _company_id: string
          _description: string
          _total_amount: number
          _transaction_date: string
        }
        Returns: boolean
      }
      generate_cash_flow: {
        Args: {
          _company_id: string
          _period_end: string
          _period_start: string
        }
        Returns: {
          closing_cash: number
          financing_activities: number
          investing_activities: number
          net_cash_flow: number
          opening_cash: number
          operating_activities: number
        }[]
      }
      get_account_suggestions: {
        Args: {
          _company_id: string
          _side: string
          _transaction_element: string
        }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          normal_balance: string
        }[]
      }
      get_trial_balance_for_company: {
        Args: never
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          balance: number
          company_id: string
          normal_balance: string
          total_credits: number
          total_debits: number
        }[]
      }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _company_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_company_coa: {
        Args: { _company_id: string }
        Returns: undefined
      }
      refresh_afs_cache: { Args: { _company_id: string }; Returns: undefined }
      settle_vat_period: {
        Args: { _tax_period_id: string }
        Returns: {
          message: string
          success: boolean
          vat_input: number
          vat_output: number
          vat_payable: number
        }[]
      }
      update_bank_balance: {
        Args: { _amount: number; _bank_account_id: string; _operation: string }
        Returns: undefined
      }
      update_budget_actuals: { Args: never; Returns: undefined }
      validate_accounting_equation: {
        Args: { _company_id: string }
        Returns: {
          difference: number
          error_message: string
          is_valid: boolean
          total_assets: number
          total_equity: number
          total_liabilities: number
        }[]
      }
      validate_transaction_before_post: {
        Args: {
          _company_id: string
          _credit_account_id: string
          _credit_amount: number
          _debit_account_id: string
          _debit_amount: number
        }
        Returns: {
          error_message: string
          is_valid: boolean
        }[]
      }
      validate_trial_balance: {
        Args: {
          _company_id: string
          _period_end: string
          _period_start: string
        }
        Returns: {
          difference: number
          is_balanced: boolean
          total_credits: number
          total_debits: number
        }[]
      }
      post_pay_run_finalize: { Args: { _pay_run_id: string }; Returns: undefined }
      post_pay_run_pay: { Args: { _pay_run_id: string; _amount: number }; Returns: undefined }
      post_statutory_remit: { Args: { _company_id: string; _type: string; _amount: number; _reference: string }; Returns: undefined }
      post_monthly_depreciation: {
        Args: { _company_id: string; _posting_date: string }
        Returns: { asset_id: string | null; amount: number; error_message: string | null }[]
      }
      post_monthly_loan_interest: {
        Args: { _company_id: string; _posting_date: string }
        Returns: { loan_id: string | null; interest_amount: number; journal_entry_id: string | null; success: boolean; message: string }[]
      }
    }
    Enums: {
      app_role: "administrator" | "accountant" | "manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrator", "accountant", "manager"],
    },
  },
} as const
