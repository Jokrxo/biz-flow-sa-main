/**
 * Permission Service
 * Implements RBAC with the following roles:
 * - Administrator (full access)
 * - SalesUser
 * - Accountant
 * - Viewer
 */

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/useAuth';

// Permission definitions
export type Permission = 
  | 'view_customers'
  | 'create_customers'
  | 'edit_customers'
  | 'delete_customers'
  | 'view_invoices'
  | 'create_invoices'
  | 'edit_invoices'
  | 'delete_invoices'
  | 'post_invoices'
  | 'view_quotes'
  | 'create_quotes'
  | 'edit_quotes'
  | 'delete_quotes'
  | 'view_adjustments'
  | 'create_adjustments'
  | 'view_reports'
  | 'view_audit_trail'
  | 'restore_records'
  | 'override_status'
  | 'view_reconciliation'
  | 'manage_users';

// Role to permissions mapping
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  administrator: [
    'view_customers',
    'create_customers',
    'edit_customers',
    'delete_customers',
    'view_invoices',
    'create_invoices',
    'edit_invoices',
    'delete_invoices',
    'post_invoices',
    'view_quotes',
    'create_quotes',
    'edit_quotes',
    'delete_quotes',
    'view_adjustments',
    'create_adjustments',
    'view_reports',
    'view_audit_trail',
    'restore_records',
    'override_status',
    'view_reconciliation',
    'manage_users',
  ],
  accountant: [
    'view_customers',
    'create_customers',
    'edit_customers',
    'view_invoices',
    'create_invoices',
    'edit_invoices',
    'post_invoices',
    'view_quotes',
    'create_quotes',
    'edit_quotes',
    'view_adjustments',
    'create_adjustments',
    'view_reports',
    'view_audit_trail',
    'view_reconciliation',
  ],
  sales_user: [
    'view_customers',
    'create_customers',
    'edit_customers',
    'view_invoices',
    'create_invoices',
    'view_quotes',
    'create_quotes',
    'edit_quotes',
    'view_adjustments',
    'create_adjustments',
    'view_reports',
  ],
  viewer: [
    'view_customers',
    'view_invoices',
    'view_quotes',
    'view_reports',
  ],
};

export class PermissionService {
  private companyId: string;
  private userId?: string;
  private roles: string[] = [];

  constructor(companyId: string, userId?: string, roles: string[] = []) {
    this.companyId = companyId;
    this.userId = userId;
    this.roles = roles;
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: Permission): boolean {
    // Administrators have all permissions
    if (this.roles.includes('administrator')) {
      return true;
    }

    // Check if any of the user's roles grant this permission
    for (const role of this.roles) {
      const permissions = ROLE_PERMISSIONS[role] || [];
      if (permissions.includes(permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission(permissions: Permission[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  hasAllPermissions(permissions: Permission[]): boolean {
    return permissions.every(p => this.hasPermission(p));
  }

  /**
   * Get all permissions for the current user
   */
  getPermissions(): Permission[] {
    const permissions = new Set<Permission>();
    
    for (const role of this.roles) {
      const rolePerms = ROLE_PERMISSIONS[role] || [];
      rolePerms.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  /**
   * Check if user is administrator
   */
  isAdministrator(): boolean {
    return this.roles.includes('administrator');
  }

  /**
   * Check if user can override status (admin only)
   */
  canOverrideStatus(): boolean {
    return this.hasPermission('override_status');
  }

  /**
   * Check if user can view audit trail
   */
  canViewAuditTrail(): boolean {
    return this.hasPermission('view_audit_trail');
  }

  /**
   * Check if user can restore soft-deleted records
   */
  canRestoreRecords(): boolean {
    return this.hasPermission('restore_records');
  }

  /**
   * Check if user can view reconciliation dashboard
   */
  canViewReconciliation(): boolean {
    return this.hasPermission('view_reconciliation');
  }

  /**
   * Check if user can create invoices for inactive customers (admin override)
   */
  canOverrideCustomerStatus(): boolean {
    return this.hasPermission('override_status');
  }
}

/**
 * Hook to check permissions in React components
 */
export function usePermissions(companyId?: string, roles: string[] = []) {
  const service = new PermissionService(companyId || '', undefined, roles);

  return {
    hasPermission: (permission: Permission) => service.hasPermission(permission),
    hasAnyPermission: (permissions: Permission[]) => service.hasAnyPermission(permissions),
    hasAllPermissions: (permissions: Permission[]) => service.hasAllPermissions(permissions),
    getPermissions: () => service.getPermissions(),
    isAdministrator: () => service.isAdministrator(),
    canOverrideStatus: () => service.canOverrideStatus(),
    canViewAuditTrail: () => service.canViewAuditTrail(),
    canRestoreRecords: () => service.canRestoreRecords(),
    canViewReconciliation: () => service.canViewReconciliation(),
  };
}

/**
 * Check if user can perform action - helper for components
 */
export async function canPerformAction(
  companyId: string,
  action: Permission
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Get user roles
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('company_id', companyId);

    const userRoles = (roles || []).map(r => r.role);
    const service = new PermissionService(companyId, user.id, userRoles);

    return service.hasPermission(action);
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const displayNames: Record<string, string> = {
    administrator: 'Administrator',
    accountant: 'Accountant',
    sales_user: 'Sales User',
    manager: 'Manager',
    viewer: 'Viewer',
  };
  return displayNames[role] || role;
}

/**
 * Get all available roles
 */
export function getAvailableRoles(): { value: string; label: string }[] {
  return [
    { value: 'administrator', label: 'Administrator' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'sales_user', label: 'Sales User' },
    { value: 'viewer', label: 'Viewer' },
  ];
}
