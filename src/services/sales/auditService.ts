/**
 * Audit Trail Service
 * Centralized audit logging for all Sales module operations
 * 
 * This service provides transactional, non-blocking audit logging
 * following the requirements in section 1.1 of the specification
 */

import { supabase } from '@/integrations/supabase/client';

export type AuditAction = 
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'customer.restore'
  | 'invoice.create'
  | 'invoice.update'
  | 'invoice.status_change'
  | 'invoice.post'
  | 'invoice.cancel'
  | 'invoice.print'
  | 'quote.create'
  | 'quote.update'
  | 'quote.status_change'
  | 'quote.print'
  | 'debit_note.create'
  | 'credit_note.create'
  | 'adjustment.create';

export interface AuditLogEntry {
  id?: string;
  company_id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  description?: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  session_id?: string;
  timestamp?: string;
}

// Action descriptions map
const ACTION_DESCRIPTIONS: Record<string, string> = {
  'customer.create': 'Customer created',
  'customer.update': 'Customer updated',
  'customer.delete': 'Customer soft-deleted',
  'customer.restore': 'Customer restored',
  'invoice.create': 'Invoice created',
  'invoice.update': 'Invoice updated',
  'invoice.status_change': 'Invoice status changed',
  'invoice.post': 'Invoice posted to GL',
  'invoice.cancel': 'Invoice cancelled',
  'invoice.print': 'Invoice printed',
  'quote.create': 'Quote created',
  'quote.update': 'Quote updated',
  'quote.status_change': 'Quote status changed',
  'quote.print': 'Quote printed',
  'debit_note.create': 'Debit note created',
  'credit_note.create': 'Credit note created',
  'adjustment.create': 'Adjustment created',
};

export class AuditService {
  private companyId: string;
  private userId?: string;

  constructor(companyId: string, userId?: string) {
    this.companyId = companyId;
    this.userId = userId;
  }

  /**
   * Log an audit event - non-blocking, transactional
   */
  async log(
    action: AuditAction,
    entityType: string,
    entityId: string,
    description?: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    try {
      // Use raw query to avoid TypeScript type issues with new tables
      await supabase.rpc('log_audit_event', {
        p_company_id: this.companyId,
        p_user_id: this.userId || null,
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_description: description || ACTION_DESCRIPTIONS[action] || action,
        p_old_value: oldValue ? JSON.stringify(oldValue) : null,
        p_new_value: newValue ? JSON.stringify(newValue) : null,
      });
    } catch (error) {
      // Fallback: try direct insert if RPC doesn't exist
      try {
        const { error: insertError } = await (supabase as any)
          .from('audit_logs')
          .insert({
            company_id: this.companyId,
            user_id: this.userId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            description: description || ACTION_DESCRIPTIONS[action] || action,
            old_value: oldValue ? JSON.stringify(oldValue) : null,
            new_value: newValue ? JSON.stringify(newValue) : null,
            timestamp: new Date().toISOString(),
          });
        
        if (insertError) {
          console.error('Failed to create audit log:', insertError);
        }
      } catch (e) {
        console.error('Audit logging error:', e);
        // Never throw - audit logging should not break business operations
      }
    }
  }

  /**
   * Log customer operations
   */
  async logCustomerOperation(
    action: 'customer.create' | 'customer.update' | 'customer.delete' | 'customer.restore',
    customerId: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log(action, 'customer', customerId, ACTION_DESCRIPTIONS[action], oldValue, newValue);
  }

  /**
   * Log invoice operations
   */
  async logInvoiceOperation(
    action: 'invoice.create' | 'invoice.update' | 'invoice.status_change' | 'invoice.post' | 'invoice.cancel' | 'invoice.print',
    invoiceId: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log(action, 'invoice', invoiceId, ACTION_DESCRIPTIONS[action], oldValue, newValue);
  }

  /**
   * Log quote operations
   */
  async logQuoteOperation(
    action: 'quote.create' | 'quote.update' | 'quote.status_change' | 'quote.print',
    quoteId: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log(action, 'quote', quoteId, ACTION_DESCRIPTIONS[action], oldValue, newValue);
  }

  /**
   * Log adjustment operations
   */
  async logAdjustmentOperation(
    action: 'debit_note.create' | 'credit_note.create' | 'adjustment.create',
    entityId: string,
    description: string,
    oldValue?: Record<string, unknown>,
    newValue?: Record<string, unknown>
  ): Promise<void> {
    await this.log(action, 'adjustment', entityId, description, oldValue, newValue);
  }

  /**
   * Get audit logs for an entity
   */
  async getEntityAuditLogs(
    entityType: string,
    entityId: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to fetch audit logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }

  /**
   * Get all audit logs for a company
   */
  async getCompanyAuditLogs(
    startDate?: string,
    endDate?: string,
    entityType?: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    try {
      let query = (supabase as any)
        .from('audit_logs')
        .select('*')
        .eq('company_id', this.companyId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (startDate) {
        query = query.gte('timestamp', startDate);
      }
      if (endDate) {
        query = query.lte('timestamp', endDate);
      }
      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to fetch audit logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      return [];
    }
  }
}

/**
 * Factory function to create audit service with current user context
 */
export async function createAuditService(companyId: string): Promise<AuditService> {
  const { data: { user } } = await supabase.auth.getUser();
  return new AuditService(companyId, user?.id);
}

/**
 * Log helper for components - creates service and logs in one call
 */
export async function logAudit(
  companyId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  description?: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>
): Promise<void> {
  const auditService = await createAuditService(companyId);
  await auditService.log(action, entityType, entityId, description, oldValue, newValue);
}
