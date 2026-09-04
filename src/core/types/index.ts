// Core type definitions for OmniKès

export interface OrganizationContext {
  organizationId: string;
  storeId?: string;
  userId: string;
  userRoles: string[];
}

export interface PermissionCheck {
  permission: string;
  organizationId: string;
  storeId?: string;
}

export interface AuditLogEntry {
  action: string;
  module: string;
  entityId?: string;
  entityType?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface HardwareDevice {
  id: string;
  type: 'printer' | 'scanner' | 'cash_drawer' | 'scale' | 'payment_terminal' | 'customer_display';
  status: 'connected' | 'disconnected' | 'error';
  lastSeen: Date;
}

export interface SyncOperation {
  id: string;
  entityType: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  status: 'pending' | 'synced' | 'failed';
  createdAt: Date;
  syncedAt?: Date;
}
