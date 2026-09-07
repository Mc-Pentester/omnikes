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

// Product validation
export const productSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().min(1, 'Product name is required').max(255, 'Product name must be less than 255 characters'),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
});

export const productUpdateSchema = productSchema.partial().omit({ organizationId: true });

// ProductVariant validation
export const productVariantSchema = z.object({
  productId: z.string().cuid(),
  sku: z.string().min(1, 'SKU is required').max(100, 'SKU must be less than 100 characters'),
  barcode: z.string().max(50).optional(),
  price: z.number().nonnegative('Price must be non-negative').refine((val) => val >= 0, 'Price must be at least 0'),
  cost: z.number().nonnegative('Cost must be non-negative').refine((val) => val >= 0, 'Cost must be at least 0'),
  attributes: z.any().optional(),
  isActive: z.boolean().default(true),
});

export const productVariantUpdateSchema = productVariantSchema.partial().omit({ productId: true });

// Inventory validation
export const inventorySchema = z.object({
  storeId: z.string().cuid(),
  variantId: z.string().cuid(),
  quantity: z.int().min(0, 'Quantity must be non-negative').default(0),
  reservedQuantity: z.int().min(0, 'Reserved quantity must be non-negative').default(0),
});

export const inventoryUpdateSchema = inventorySchema.partial().omit({ storeId: true, variantId: true });

// InventoryMovement validation
export const inventoryMovementSchema = z.object({
  inventoryId: z.string().cuid(),
  type: z.enum(['SALE', 'PURCHASE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'], {
    message: 'Invalid movement type',
  }),
  quantity: z.int().refine((val) => val !== 0, 'Quantity cannot be zero'),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const inventoryMovementUpdateSchema = inventoryMovementSchema.partial().omit({ inventoryId: true });

// Sale validation
export const saleSchema = z.object({
  organizationId: z.string().cuid(),
  storeId: z.string().cuid(),
  orderNumber: z.string().min(1, 'Order number is required'),
  customerId: z.string().cuid().optional(),
  channel: z.string().default('POS'),
  status: z.string().default('PENDING'),
  subtotal: z.number().nonnegative('Subtotal must be non-negative'),
  tax: z.number().nonnegative('Tax must be non-negative').default(0),
  total: z.number().nonnegative('Total must be non-negative'),
  discount: z.number().nonnegative('Discount must be non-negative').default(0),
  notes: z.string().max(1000).optional(),
});

export const saleUpdateSchema = saleSchema.partial().omit({ organizationId: true, orderNumber: true });

// SaleItem validation
export const saleItemSchema = z.object({
  saleId: z.string().cuid(),
  variantId: z.string().cuid(),
  quantity: z.int().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  totalPrice: z.number().nonnegative('Total price must be non-negative'),
  discount: z.number().nonnegative('Discount must be non-negative').default(0),
});

export const saleItemUpdateSchema = saleItemSchema.partial().omit({ saleId: true, variantId: true });

// Payment validation
export const paymentSchema = z.object({
  saleId: z.string().cuid(),
  method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK', 'CREDIT'], {
    message: 'Invalid payment method',
  }),
  amount: z.number().positive('Amount must be positive'),
  reference: z.string().max(200).optional(),
  status: z.string().default('COMPLETED'),
});

export const paymentUpdateSchema = paymentSchema.partial().omit({ saleId: true });

// Proforma validation
export const proformaSchema = z.object({
  organizationId: z.string().cuid(),
  storeId: z.string().cuid(),
  proformaNumber: z.string().min(1, 'Proforma number is required'),
  customerId: z.string().cuid().optional(),
  status: z.string().default('DRAFT'),
  subtotal: z.number().nonnegative('Subtotal must be non-negative'),
  tax: z.number().nonnegative('Tax must be non-negative').default(0),
  total: z.number().nonnegative('Total must be non-negative'),
  discount: z.number().nonnegative('Discount must be non-negative').default(0),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});

export const proformaUpdateSchema = proformaSchema.partial().omit({ organizationId: true, proformaNumber: true });

// ProformaItem validation
export const proformaItemSchema = z.object({
  proformaId: z.string().cuid(),
  variantId: z.string().cuid(),
  quantity: z.int().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  totalPrice: z.number().nonnegative('Total price must be non-negative'),
  discount: z.number().nonnegative('Discount must be non-negative').default(0),
});

export const proformaItemUpdateSchema = proformaItemSchema.partial().omit({ proformaId: true, variantId: true });

// Sales Report validation
export const salesReportPeriodSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  storeId: z.string().cuid().optional(),
  granularity: z.enum(['day', 'week', 'month']),
}).refine((data) => {
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    return false;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
});

export const salesReportProductSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  storeId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(1000).default(50),
}).refine((data) => {
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    return false;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
});

export const salesReportStoreSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    return false;
  }
  return true;
}, {
  message: 'startDate must be before or equal to endDate',
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type PermissionInput = z.infer<typeof permissionSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type ProductVariantUpdateInput = z.infer<typeof productVariantUpdateSchema>;
export type InventoryInput = z.infer<typeof inventorySchema>;
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;
export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>;
export type InventoryMovementUpdateInput = z.infer<typeof inventoryMovementUpdateSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type SaleUpdateInput = z.infer<typeof saleUpdateSchema>;
export type SaleItemInput = z.infer<typeof saleItemSchema>;
export type SaleItemUpdateInput = z.infer<typeof saleItemUpdateSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PaymentUpdateInput = z.infer<typeof paymentUpdateSchema>;
export type ProformaInput = z.infer<typeof proformaSchema>;
export type ProformaUpdateInput = z.infer<typeof proformaUpdateSchema>;
export type ProformaItemInput = z.infer<typeof proformaItemSchema>;
export type ProformaItemUpdateInput = z.infer<typeof proformaItemUpdateSchema>;
