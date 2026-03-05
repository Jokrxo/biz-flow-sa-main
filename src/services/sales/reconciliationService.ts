/**
 * Customer Reconciliation Service
 * Implements the accounting reconciliation requirements:
 * - Customer running balance calculation
 * - Debtors Control reconciliation
 * - Negative balance detection
 * - Orphan transaction prevention
 */

import { supabase } from '@/integrations/supabase/client';

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  ledgerBalance: number;
  invoiceTotal: number;
  paymentsReceived: number;
  variance: number;
  isReconciled: boolean;
}

export interface ReconciliationSummary {
  totalLedgerBalance: number;
  totalInvoiceTotal: number;
  totalPayments: number;
  positiveVariance: number;
  negativeVariance: number;
  reconciledCustomers: number;
  unreconciledCustomers: number;
  customersWithNegativeBalance: number;
}

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  document_type: string;
  document_id: string;
  reference_number: string;
  debit: number;
  credit: number;
  running_balance: number;
  posting_date: string;
  description: string;
  created_at: string;
}

export class ReconciliationService {
  private companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
  }

  /**
   * Get reconciliation data for all customers
   */
  async getCustomerReconciliation(): Promise<CustomerBalance[]> {
    try {
      // Use the view we created
      const { data, error } = await (supabase as any)
        .from('v_debtors_reconciliation')
        .select('*')
        .eq('company_id', this.companyId);

      if (error) throw error;

      return (data || []).map((row: any) => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        ledgerBalance: row.ledger_balance || 0,
        invoiceTotal: row.invoice_total || 0,
        paymentsReceived: row.payments_received || 0,
        variance: (row.invoice_total || 0) - (row.payments_received || 0) - (row.ledger_balance || 0),
        isReconciled: Math.abs(((row.invoice_total || 0) - (row.payments_received || 0) - (row.ledger_balance || 0))) < 0.01,
      }));
    } catch (error) {
      console.error('Error getting reconciliation data:', error);
      return [];
    }
  }

  /**
   * Get reconciliation summary for the company
   */
  async getReconciliationSummary(): Promise<ReconciliationSummary> {
    const customers = await this.getCustomerReconciliation();

    let totalLedgerBalance = 0;
    let totalInvoiceTotal = 0;
    let totalPayments = 0;
    let positiveVariance = 0;
    let negativeVariance = 0;
    let reconciledCustomers = 0;
    let unreconciledCustomers = 0;
    let customersWithNegativeBalance = 0;

    for (const customer of customers) {
      totalLedgerBalance += customer.ledgerBalance;
      totalInvoiceTotal += customer.invoiceTotal;
      totalPayments += customer.paymentsReceived;

      if (customer.ledgerBalance < 0) {
        customersWithNegativeBalance++;
      }

      if (customer.isReconciled) {
        reconciledCustomers++;
      } else {
        unreconciledCustomers++;
        if (customer.variance > 0) {
          positiveVariance += customer.variance;
        } else {
          negativeVariance += Math.abs(customer.variance);
        }
      }
    }

    return {
      totalLedgerBalance,
      totalInvoiceTotal,
      totalPayments,
      positiveVariance,
      negativeVariance,
      reconciledCustomers,
      unreconciledCustomers,
      customersWithNegativeBalance,
    };
  }

  /**
   * Get running balance for a specific customer
   */
  async getCustomerRunningBalance(customerId: string): Promise<number> {
    try {
      const { data, error } = await (supabase as any)
        .from('customer_ledger')
        .select('running_balance')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data?.running_balance || 0;
    } catch (error) {
      console.error('Error getting running balance:', error);
      return 0;
    }
  }

  /**
   * Get customer ledger entries
   */
  async getCustomerLedgerEntries(
    customerId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CustomerLedgerEntry[]> {
    try {
      let query = (supabase as any)
        .from('customer_ledger')
        .select('*')
        .eq('customer_id', customerId)
        .order('posting_date', { ascending: true });

      if (startDate) {
        query = query.gte('posting_date', startDate);
      }
      if (endDate) {
        query = query.lte('posting_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting ledger entries:', error);
      return [];
    }
  }

  /**
   * Recalculate running balance for a customer
   */
  async recalculateCustomerBalance(customerId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase.rpc('recalculate_customer_balance', {
        p_customer_id: customerId,
      });
      return { success: true };
    } catch (error: any) {
      console.error('Error recalculating balance:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a customer has negative balance
   */
  async hasNegativeBalance(customerId: string): Promise<boolean> {
    const balance = await this.getCustomerRunningBalance(customerId);
    return balance < 0;
  }

  /**
   * Check if negative balance is allowed
   * Returns true if there's an open credit note or admin override
   */
  async canHaveNegativeBalance(
    customerId: string,
    hasAdminOverride: boolean = false
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Admin override always allows negative balance
    if (hasAdminOverride) {
      return { allowed: true };
    }

    // Check for open credit notes
    const { data: creditNotes } = await (supabase as any)
      .from('credit_notes')
      .select('id, amount, status')
      .eq('customer_id', customerId)
      .eq('status', 'active');

    const availableCredit = (creditNotes || []).reduce(
      (sum: number, note: any) => sum + (note.amount || 0),
      0
    );

    const currentBalance = await this.getCustomerRunningBalance(customerId);
    
    // If there's sufficient credit note balance to offset the negative
    if (currentBalance + availableCredit >= 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Customer has negative balance without available credit notes',
    };
  }

  /**
   * Validate no orphan transactions exist
   */
  async validateNoOrphanTransactions(): Promise<{
    isValid: boolean;
    orphans: string[];
  }> {
    const orphans: string[] = [];

    try {
      // Check invoices without customer
      const { data: invoicesWithoutCustomer } = await (supabase as any)
        .from('invoices')
        .select('id, invoice_number')
        .eq('company_id', this.companyId)
        .is('customer_id', null);

      if (invoicesWithoutCustomer && invoicesWithoutCustomer.length > 0) {
        orphans.push(
          ...invoicesWithoutCustomer.map(
            (inv: any) => `Invoice ${inv.invoice_number} has no customer`
          )
        );
      }

      // Check ledger entries without document
      const { data: ledgerWithoutDoc } = await (supabase as any)
        .from('customer_ledger')
        .select('id')
        .eq('company_id', this.companyId)
        .is('document_id', null);

      if (ledgerWithoutDoc && ledgerWithoutDoc.length > 0) {
        orphans.push(`${ledgerWithoutDoc.length} ledger entries without document reference`);
      }

      return {
        isValid: orphans.length === 0,
        orphans,
      };
    } catch (error) {
      console.error('Error validating orphans:', error);
      return { isValid: false, orphans: ['Error validating transactions'] };
    }
  }

  /**
   * Get customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<Array<{
    customerId: string;
    customerName: string;
    balance: number;
  }>> {
    try {
      const { data, error } = await (supabase as any)
        .from('v_debtors_reconciliation')
        .select('*')
        .eq('company_id', this.companyId)
        .gt('ledger_balance', 0);

      if (error) throw error;

      return (data || []).map((row: any) => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        balance: row.ledger_balance || 0,
      }));
    } catch (error) {
      console.error('Error getting outstanding balances:', error);
      return [];
    }
  }

  /**
   * Get aged debtors report
   */
  async getAgedDebtorsReport(
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<Array<{
    customerId: string;
    customerName: string;
    current: number;
    days30: number;
    days60: number;
    days90: number;
    over90: number;
    total: number;
  }>> {
    try {
      // Get all invoices and their payments
      const { data: invoices, error } = await (supabase as any)
        .from('invoices')
        .select('id, customer_id, customer_name, total_amount, invoice_date, status')
        .eq('company_id', this.companyId)
        .in('status', ['posted', 'paid'])
        .lte('invoice_date', asOfDate);

      if (error) throw error;

      // Get all payments
      const { data: payments } = await (supabase as any)
        .from('invoice_payments')
        .select('invoice_id, amount, payment_date')
        .eq('company_id', this.companyId)
        .lte('payment_date', asOfDate);

      // Group by customer and calculate aging
      const customerMap = new Map<string, any>();

      for (const invoice of invoices || []) {
        if (invoice.status === 'paid') continue;

        const invoiceDate = new Date(invoice.invoice_date);
        const asOf = new Date(asOfDate);
        const daysOverdue = Math.floor(
          (asOf.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Calculate amount owed (simplified - would need more complex logic in production)
        const amountOwed = invoice.total_amount;

        if (!customerMap.has(invoice.customer_id)) {
          customerMap.set(invoice.customer_id, {
            customerId: invoice.customer_id,
            customerName: invoice.customer_name,
            current: 0,
            days30: 0,
            days60: 0,
            days90: 0,
            over90: 0,
            total: 0,
          });
        }

        const customer = customerMap.get(invoice.customer_id);
        
        if (daysOverdue <= 0) {
          customer.current += amountOwed;
        } else if (daysOverdue <= 30) {
          customer.days30 += amountOwed;
        } else if (daysOverdue <= 60) {
          customer.days60 += amountOwed;
        } else if (daysOverdue <= 90) {
          customer.days90 += amountOwed;
        } else {
          customer.over90 += amountOwed;
        }

        customer.total += amountOwed;
      }

      return Array.from(customerMap.values());
    } catch (error) {
      console.error('Error generating aged debtors report:', error);
      return [];
    }
  }
}

/**
 * Factory function to create reconciliation service
 */
export function createReconciliationService(companyId: string): ReconciliationService {
  return new ReconciliationService(companyId);
}
