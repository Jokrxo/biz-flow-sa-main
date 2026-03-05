/**
 * Customer Service
 * Handles all customer-related business logic including:
 * - Duplicate validation (name, account code, VAT)
 * - Credit terms validation
 * - Active/Inactive status management
 * - Soft delete with constraints
 * - Restoration
 */

import { supabase } from '@/integrations/supabase/client';
import { logAudit } from './auditService';

// VAT validation regex patterns by country code
const VAT_PATTERNS: Record<string, RegExp> = {
  ZA: /^ZA\d{9,10}$/,  // South Africa
  GB: /^GB\d{9,9}$|^GB\d{12,12}$|^GBGD\d{3}$|^GBHA\d{3}$/,  // United Kingdom
  US: /^\d{2}-\d{7}$/, // United States (EIN format)
  default: /^[A-Z]{2}[A-Z0-9+*]{2,12}$/,  // Generic EU-style
};

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  company_id: string;
  account_code?: string;
  vat_number?: string;
  credit_terms?: number;
  credit_limit?: number;
  is_active?: boolean;
}

export interface Customer extends CustomerInput {
  id: string;
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by?: string;
  created_at: string;
  updated_at?: string;
  balance?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class CustomerService {
  private companyId: string;
  private userId?: string;

  constructor(companyId: string, userId?: string) {
    this.companyId = companyId;
    this.userId = userId;
  }

  /**
   * Validate customer input data
   */
  async validateCustomer(input: CustomerInput, excludeId?: string): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate name is not empty
    if (!input.name || input.name.trim().length === 0) {
      errors.push('Customer name is required');
    }

    // Check for duplicate name
    const isDuplicateName = await this.checkDuplicateName(input.name, excludeId);
    if (isDuplicateName) {
      errors.push('A customer with this name already exists');
    }

    // Check for duplicate account code
    if (input.account_code) {
      const isDuplicateCode = await this.checkDuplicateAccountCode(input.account_code, excludeId);
      if (isDuplicateCode) {
        errors.push('This account code is already in use');
      }
    }

    // Validate VAT number if provided
    if (input.vat_number) {
      const vatValidation = this.validateVATNumber(input.vat_number);
      if (!vatValidation.isValid) {
        errors.push(vatValidation.error!);
      }
    }

    // Validate credit terms
    if (input.credit_terms !== undefined && input.credit_terms < 0) {
      errors.push('Credit terms must be 0 or greater');
    }

    // Validate credit limit
    if (input.credit_limit !== undefined && input.credit_limit < 0) {
      errors.push('Credit limit must be 0 or greater');
    }

    // Validate email format if provided
    if (input.email && !this.isValidEmail(input.email)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a new customer
   */
  async createCustomer(input: CustomerInput): Promise<{ customer?: Customer; error?: string }> {
    // Validate input
    const validation = await this.validateCustomer(input);
    if (!validation.isValid) {
      return { error: validation.errors.join(', ') };
    }

    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .insert({
          name: input.name.trim(),
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          company_id: input.company_id,
          account_code: input.account_code || null,
          vat_number: input.vat_number?.trim() || null,
          credit_terms: input.credit_terms ?? 30,
          credit_limit: input.credit_limit ?? 0,
          is_active: input.is_active ?? true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit event
      await logAudit(
        this.companyId,
        'customer.create',
        'customer',
        data.id,
        'Customer created',
        undefined,
        data
      );

      return { customer: data };
    } catch (error: any) {
      console.error('Error creating customer:', error);
      return { error: error.message || 'Failed to create customer' };
    }
  }

  /**
   * Update an existing customer
   */
  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<{ customer?: Customer; error?: string }> {
    // Get existing customer for audit
    const existing = await this.getCustomerById(id);
    if (!existing) {
      return { error: 'Customer not found' };
    }

    // Validate input
    const validation = await this.validateCustomer({ ...existing, ...input } as CustomerInput, id);
    if (!validation.isValid) {
      return { error: validation.errors.join(', ') };
    }

    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .update({
          ...(input.name && { name: input.name.trim() }),
          ...(input.email !== undefined && { email: input.email?.trim() || null }),
          ...(input.phone !== undefined && { phone: input.phone?.trim() || null }),
          ...(input.address !== undefined && { address: input.address?.trim() || null }),
          ...(input.account_code !== undefined && { account_code: input.account_code || null }),
          ...(input.vat_number !== undefined && { vat_number: input.vat_number?.trim() || null }),
          ...(input.credit_terms !== undefined && { credit_terms: input.credit_terms }),
          ...(input.credit_limit !== undefined && { credit_limit: input.credit_limit }),
          ...(input.is_active !== undefined && { is_active: input.is_active }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log audit event
      await logAudit(
        this.companyId,
        'customer.update',
        'customer',
        id,
        'Customer updated',
        existing,
        data
      );

      return { customer: data };
    } catch (error: any) {
      console.error('Error updating customer:', error);
      return { error: error.message || 'Failed to update customer' };
    }
  }

  /**
   * Soft delete a customer
   */
  async softDeleteCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    // Get existing customer
    const existing = await this.getCustomerById(id);
    if (!existing) {
      return { success: false, error: 'Customer not found' };
    }

    // Check if customer can be deleted
    const canDelete = await this.canSoftDelete(id);
    if (!canDelete.canDelete) {
      return { success: false, error: canDelete.reason! };
    }

    try {
      const { error } = await (supabase as any)
        .from('customers')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: this.userId || null,
          is_active: false,
        })
        .eq('id', id);

      if (error) throw error;

      // Log audit event
      await logAudit(
        this.companyId,
        'customer.delete',
        'customer',
        id,
        'Customer soft-deleted',
        existing,
        { ...existing, is_deleted: true, deleted_at: new Date().toISOString() }
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error soft-deleting customer:', error);
      return { success: false, error: error.message || 'Failed to delete customer' };
    }
  }

  /**
   * Restore a soft-deleted customer (Admin only)
   */
  async restoreCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await (supabase as any)
        .from('customers')
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by: null,
        })
        .eq('id', id);

      if (error) throw error;

      // Log audit event
      await logAudit(
        this.companyId,
        'customer.restore',
        'customer',
        id,
        'Customer restored from soft-delete'
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error restoring customer:', error);
      return { success: false, error: error.message || 'Failed to restore customer' };
    }
  }

  /**
   * Check if customer can be soft-deleted
   */
  async canSoftDelete(customerId: string): Promise<{ canDelete: boolean; reason?: string }> {
    try {
      const { data, error } = await supabase.rpc('can_soft_delete_customer', {
        p_customer_id: customerId,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        return { canDelete: data[0].can_delete, reason: data[0].reason };
      }

      return { canDelete: false, reason: 'Unable to verify deletion constraints' };
    } catch (error) {
      console.error('Error checking delete eligibility:', error);
      // If RPC fails, try manual checks
      return await this.manualCanSoftDelete(customerId);
    }
  }

  /**
   * Manual check if customer can be deleted (fallback)
   */
  private async manualCanSoftDelete(customerId: string): Promise<{ canDelete: boolean; reason?: string }> {
    try {
      // Check outstanding balance
      const { data: balanceData } = await (supabase as any)
        .from('customer_ledger')
        .select('running_balance')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (balanceData && balanceData.running_balance > 0.01) {
        return { canDelete: false, reason: 'Customer has outstanding balance' };
      }

      // Check open invoices
      const { count: openInvoices } = await (supabase as any)
        .from('invoices')
        .select('id', { count: 'exact' })
        .eq('customer_id', customerId)
        .in('status', ['draft', 'sent', 'posted']);

      if (openInvoices && openInvoices > 0) {
        return { canDelete: false, reason: 'Customer has open invoices' };
      }

      return { canDelete: true };
    } catch (error) {
      console.error('Error in manual delete check:', error);
      return { canDelete: false, reason: 'Unable to verify deletion constraints' };
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching customer:', error);
      return null;
    }
  }

  /**
   * Get all active customers for a company
   */
  async getActiveCustomers(): Promise<Customer[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('*')
        .eq('company_id', this.companyId)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching active customers:', error);
      return [];
    }
  }

  /**
   * Get all customers including inactive and soft-deleted
   */
  async getAllCustomers(includeDeleted: boolean = false): Promise<Customer[]> {
    try {
      let query = (supabase as any)
        .from('customers')
        .select('*')
        .eq('company_id', this.companyId);

      if (!includeDeleted) {
        query = query.eq('is_deleted', false);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching customers:', error);
      return [];
    }
  }

  /**
   * Check for duplicate customer name
   */
  private async checkDuplicateName(name: string, excludeId?: string): Promise<boolean> {
    try {
      let query = (supabase as any)
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', this.companyId)
        .ilike('name', name.trim());

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { count, error } = await query;
      if (error) throw error;

      return (count || 0) > 0;
    } catch (error) {
      console.error('Error checking duplicate name:', error);
      return false;
    }
  }

  /**
   * Check for duplicate account code
   */
  private async checkDuplicateAccountCode(accountCode: string, excludeId?: string): Promise<boolean> {
    if (!accountCode) return false;

    try {
      let query = (supabase as any)
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', this.companyId)
        .eq('account_code', accountCode.trim());

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { count, error } = await query;
      if (error) throw error;

      return (count || 0) > 0;
    } catch (error) {
      console.error('Error checking duplicate account code:', error);
      return false;
    }
  }

  /**
   * Validate VAT number format
   */
  private validateVATNumber(vatNumber: string): { isValid: boolean; error?: string } {
    const trimmed = vatNumber.trim().toUpperCase();
    
    // Try to detect country from prefix
    let countryCode = 'default';
    if (trimmed.startsWith('ZA')) countryCode = 'ZA';
    else if (trimmed.startsWith('GB')) countryCode = 'GB';
    else if (trimmed.startsWith('US')) countryCode = 'US';
    
    const pattern = VAT_PATTERNS[countryCode] || VAT_PATTERNS.default;
    
    if (!pattern.test(trimmed)) {
      return { isValid: false, error: 'Invalid VAT number format' };
    }
    
    return { isValid: true };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Block invoice creation for inactive customers
   */
  async canCreateInvoice(customerId: string): Promise<{ canCreate: boolean; error?: string }> {
    const customer = await this.getCustomerById(customerId);
    
    if (!customer) {
      return { canCreate: false, error: 'Customer not found' };
    }
    
    if (customer.is_deleted) {
      return { canCreate: false, error: 'Cannot create invoice for deleted customer' };
    }
    
    if (customer.is_active === false) {
      return { canCreate: false, error: 'Cannot create invoice for inactive customer' };
    }
    
    return { canCreate: true };
  }
}

/**
 * Factory function to create customer service
 */
export async function createCustomerService(companyId: string): Promise<CustomerService> {
  const { data: { user } } = await supabase.auth.getUser();
  return new CustomerService(companyId, user?.id);
}
