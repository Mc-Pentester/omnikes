export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthContext {
  userId: string;
  organizationId: string;
  storeId?: string;
  roles: string[];
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  isActive: boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  organizationId: string;
}
