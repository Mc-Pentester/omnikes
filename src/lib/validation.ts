import { z } from 'zod';

// Organization validation
export const organizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  country: z.string().min(2).max(2),
  currency: z.string().default('USD'),
  locale: z.string().default('en-US'),
  timezone: z.string().default('UTC'),
  cloudEnabled: z.boolean().default(false),
  onlineStoreEnabled: z.boolean().default(false),
});

// Store validation
export const storeSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().min(1, 'Store name is required'),
  code: z.string().min(1, 'Store code is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().default(true),
});

// User validation
export const userSchema = z.object({
  organizationId: z.string().cuid(),
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isActive: z.boolean().default(true),
});

// Role validation
export const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  isGlobal: z.boolean().default(false),
  storeId: z.string().cuid().optional(),
});

// Permission validation
export const permissionSchema = z.object({
  code: z.string().min(1, 'Permission code is required'),
  description: z.string().optional(),
  module: z.string().min(1, 'Module is required'),
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type PermissionInput = z.infer<typeof permissionSchema>;
