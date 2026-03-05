/**
 * Sales Module Services Index
 * Exports all sales-related services
 */

export { AuditService, logAudit, createAuditService } from './auditService';
export type { AuditLogEntry, AuditAction } from './auditService';

export { CustomerService, createCustomerService } from './customerService';
export type { Customer, CustomerInput, ValidationResult } from './customerService';

export { InvoiceService, createInvoiceService } from './invoiceService';
export type { Invoice, InvoiceInput, InvoiceStatus, SalesType, ValidationResult as InvoiceValidationResult } from './invoiceService';

export { ReconciliationService, createReconciliationService } from './reconciliationService';
export type { CustomerBalance, ReconciliationSummary, CustomerLedgerEntry } from './reconciliationService';

export { AdjustmentService, createAdjustmentService, ADJUSTMENT_REASONS } from './adjustmentService';
export type { Adjustment, AdjustmentInput, AdjustmentType, AdjustmentReason } from './adjustmentService';

export { 
  PermissionService, 
  usePermissions, 
  canPerformAction, 
  getRoleDisplayName, 
  getAvailableRoles 
} from './permissionService';
export type { Permission } from './permissionService';
