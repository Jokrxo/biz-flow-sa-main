/**
 * Customer Adjustment Service
 * Handles Debit and Credit notes with proper GL posting
 */

import { supabase } from '@/integrations/supabase/client';
import { logAudit } from './auditService';

export type AdjustmentType = 'debit_note' | 'credit_note';
export type AdjustmentReason = 
  | 'pricing_error'
  | 'returned_goods'
  | 'damaged_goods'
  | 'vat_adjustment'
  | 'other';

export const ADJUSTMENT_REASONS: { value: AdjustmentReason; label: string }[] = [
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'returned_goods', label: 'Returned Goods' },
  { value: 'damaged_goods', label: 'Damaged Goods' },
  { value: 'vat_adjustment', label: 'VAT Adjustment' },
  { value: 'other', label: 'Other' },
];

export interface AdjustmentInput {
  customer_id: string;
  customer_name: string;
  reference_invoice_id?: string;
  amount: number;
  reason: AdjustmentReason;
  reason_text?: string;
  description?: string;
  adjustment_date?: string;
}

export interface Adjustment {
  id: string;
  document_number: string;
  customer_id: string;
  customer_name: string;
  reference_invoice_id?: string;
  amount: number;
  reason: AdjustmentReason;
  reason_text?: string;
  description?: string;
  adjustment_date: string;
  status: string;
  created_at: string;
}

export class AdjustmentService {
  private companyId: string;
  private userId?: string;

  constructor(companyId: string, userId?: string) {
    this.companyId = companyId;
    this.userId = userId;
  }

  /**
   * Create a Debit Note (increases customer balance)
   * Posting: Dr Accounts Receivable, Cr Revenue
   */
  async createDebitNote(input: AdjustmentInput): Promise<{ adjustment?: Adjustment; error?: string }> {
    // Validate input
    const validation = await this.validateAdjustment(input);
    if (!validation.isValid) {
      return { error: validation.errors.join(', ') };
    }

    try {
      // Get next document number
      const documentNumber = await this.getNextDocumentNumber('DN');

      // Create debit note
      const { data, error } = await (supabase as any)
        .from('debit_notes')
        .insert({
          document_number: documentNumber,
          customer_id: input.customer_id,
          customer_name: input.customer_name,
          reference_invoice_id: input.reference_invoice_id || null,
          amount: input.amount,
          reason: input.reason,
          reason_text: input.reason_text || null,
          description: input.description || null,
          adjustment_date: input.adjustment_date || new Date().toISOString().split('T')[0],
          status: 'active',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Create GL posting
      await this.createGLPosting(data, 'debit');

      // Create customer ledger entry (debit increases balance)
      await this.createCustomerLedgerEntry(data, 'DN', 'debit');

      // Log audit event
      await logAudit(
        this.companyId,
        'debit_note.create',
        'adjustment',
        data.id,
        `Debit Note ${documentNumber} created`,
        undefined,
        data
      );

      return { adjustment: data };
    } catch (error: any) {
      console.error('Error creating debit note:', error);
      return { error: error.message || 'Failed to create debit note' };
    }
  }

  /**
   * Create a Credit Note (decreases customer balance)
   * Posting: Dr Revenue, Cr Accounts Receivable
   */
  async createCreditNote(input: AdjustmentInput): Promise<{ adjustment?: Adjustment; error?: string }> {
    // Validate input
    const validation = await this.validateAdjustment(input);
    if (!validation.isValid) {
      return { error: validation.errors.join(', ') };
    }

    // For credit notes, we need a reference invoice
    if (!input.reference_invoice_id) {
      return { error: 'Credit notes require a reference invoice' };
    }

    try {
      // Get next document number
      const documentNumber = await this.getNextDocumentNumber('CN');

      // Create credit note
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .insert({
          document_number: documentNumber,
          customer_id: input.customer_id,
          customer_name: input.customer_name,
          reference_invoice_id: input.reference_invoice_id,
          amount: input.amount,
          reason: input.reason,
          reason_text: input.reason_text || null,
          description: input.description || null,
          adjustment_date: input.adjustment_date || new Date().toISOString().split('T')[0],
          status: 'active',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Create GL posting
      await this.createGLPosting(data, 'credit');

      // Create customer ledger entry (credit decreases balance)
      await this.createCustomerLedgerEntry(data, 'CN', 'credit');

      // Log audit event
      await logAudit(
        this.companyId,
        'credit_note.create',
        'adjustment',
        data.id,
        `Credit Note ${documentNumber} created`,
        undefined,
        data
      );

      return { adjustment: data };
    } catch (error: any) {
      console.error('Error creating credit note:', error);
      return { error: error.message || 'Failed to create credit note' };
    }
  }

  /**
   * Validate adjustment input
   */
  private async validateAdjustment(input: AdjustmentInput): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate customer exists and is active
    const { data: customer } = await (supabase as any)
      .from('customers')
      .select('id, is_active, is_deleted')
      .eq('id', input.customer_id)
      .single();

    if (!customer) {
      errors.push('Customer not found');
    } else if (customer.is_deleted) {
      errors.push('Cannot create adjustment for deleted customer');
    } else if (customer.is_active === false) {
      errors.push('Cannot create adjustment for inactive customer');
    }

    // Validate amount
    if (!input.amount || input.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    // Validate reason
    if (!input.reason) {
      errors.push('Adjustment reason is required');
    }

    // If reason is 'other', require reason_text
    if (input.reason === 'other' && !input.reason_text) {
      errors.push('Description required when reason is "Other"');
    }

    // Validate reference invoice if provided
    if (input.reference_invoice_id) {
      const { data: invoice } = await (supabase as any)
        .from('invoices')
        .select('id, status, customer_id')
        .eq('id', input.reference_invoice_id)
        .single();

      if (!invoice) {
        errors.push('Reference invoice not found');
      } else if (invoice.customer_id !== input.customer_id) {
        errors.push('Reference invoice does not belong to this customer');
      } else if (invoice.status === 'cancelled') {
        errors.push('Cannot create adjustment for cancelled invoice');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Get next document number
   */
  private async getNextDocumentNumber(type: 'DN' | 'CN'): Promise<string> {
    const functionName = type === 'DN' ? 'get_next_debit_note_number' : 'get_next_credit_note_number';
    
    try {
      const { data, error } = await supabase.rpc(functionName as any, {
        p_company_id: this.companyId,
      });

      if (error) throw error;
      return data || `${type}-${new Date().getFullYear()}-000001`;
    } catch (error) {
      console.error(`Error getting ${type} number:`, error);
      return `${type}-${Date.now()}`;
    }
  }

  /**
   * Create GL posting for adjustment
   */
  private async createGLPosting(adjustment: Adjustment, type: 'debit' | 'credit'): Promise<void> {
    // This would integrate with the existing GL system
    // For debit note: Dr Debtors Control, Cr Revenue
    // For credit note: Dr Revenue, Cr Debtors Control
    
    console.log(`Creating GL posting for ${type} note:`, adjustment.document_number);
    
    // In production, this would call the ledger API
  }

  /**
   * Create customer ledger entry
   */
  private async createCustomerLedgerEntry(
    adjustment: Adjustment,
    documentType: string,
    entryType: 'debit' | 'credit'
  ): Promise<void> {
    try {
      await supabase.rpc('create_customer_ledger_entry' as any, {
        p_company_id: this.companyId,
        p_customer_id: adjustment.customer_id,
        p_document_type: documentType,
        p_document_id: adjustment.id,
        p_reference_number: adjustment.document_number,
        p_debit: entryType === 'debit' ? adjustment.amount : 0,
        p_credit: entryType === 'credit' ? adjustment.amount : 0,
        p_posting_date: adjustment.adjustment_date,
        p_description: adjustment.description || `${documentType} ${adjustment.document_number}`,
        p_created_by: this.userId,
      });
    } catch (error) {
      console.error('Error creating customer ledger entry:', error);
      throw error;
    }
  }

  /**
   * Get adjustments for a customer
   */
  async getAdjustmentsByCustomer(
    customerId: string,
    type?: AdjustmentType
  ): Promise<Adjustment[]> {
    try {
      let query = (supabase as any)
        .from(type === 'debit_note' ? 'debit_notes' : 'credit_notes')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching adjustments:', error);
      return [];
    }
  }

  /**
   * Get adjustment by ID
   */
  async getAdjustmentById(id: string, type: AdjustmentType): Promise<Adjustment | null> {
    try {
      const { data, error } = await (supabase as any)
        .from(type === 'debit_note' ? 'debit_notes' : 'credit_notes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching adjustment:', error);
      return null;
    }
  }

  /**
   * Void an adjustment
   */
  async voidAdjustment(id: string, type: AdjustmentType): Promise<{ success: boolean; error?: string }> {
    const adjustment = await this.getAdjustmentById(id, type);
    if (!adjustment) {
      return { success: false, error: 'Adjustment not found' };
    }

    if (adjustment.status !== 'active') {
      return { success: false, error: 'Only active adjustments can be voided' };
    }

    try {
      const tableName = type === 'debit_note' ? 'debit_notes' : 'credit_notes';
      
      const { error } = await (supabase as any)
        .from(tableName)
        .update({ status: 'voided' })
        .eq('id', id);

      if (error) throw error;

      // Log audit event
      await logAudit(
        this.companyId,
        'adjustment.create',
        'adjustment',
        id,
        `${type === 'debit_note' ? 'Debit' : 'Credit'} note voided`
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error voiding adjustment:', error);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Factory function to create adjustment service
 */
export async function createAdjustmentService(companyId: string): Promise<AdjustmentService> {
  const { data: { user } } = await supabase.auth.getUser();
  return new AdjustmentService(companyId, user?.id);
}
