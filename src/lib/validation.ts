import { z } from 'zod';
import { MAX_MONEY_10_2, MAX_MONEY_12_2, hasAtMostTwoDecimalPlaces } from '@omnikes/lib/money';

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


// Administration - organization management
export const adminOrganizationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required').max(255).optional(),
  country: z.string().trim().length(2, 'Country must be an ISO 3166-1 alpha-2 code').transform((value) => value.toUpperCase()).optional(),
  currency: z.string().trim().length(3, 'Currency must be an ISO 4217 code').transform((value) => value.toUpperCase()).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  cloudEnabled: z.boolean().optional(),
  onlineStoreEnabled: z.boolean().optional(),
});

export type AdminOrganizationUpdateInput = z.infer<typeof adminOrganizationUpdateSchema>;
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


// Administration - user management
export const adminUserCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roleId: z.string().min(1, 'Role is required'),
  storeId: z.string().cuid().optional(),
});

export const adminUserUpdateSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(1, 'Name is required').max(255).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  isActive: z.boolean().optional(),
  roleId: z.string().min(1, 'Role is required').optional(),
  storeId: z.string().cuid().optional(),
});

// Role validation
export const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  isGlobal: z.boolean().default(false),
  storeId: z.string().cuid().optional(),
});

// Administration - role management
export const adminRoleCreateSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required').max(100),
  description: z.string().trim().max(500).optional(),
  isGlobal: z.boolean().default(false),
  storeId: z.string().cuid().optional(),
  permissionIds: z.array(z.string().cuid()).default([]),
}).superRefine((data, ctx) => {
  if (data.isGlobal && data.storeId) {
    ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'A global role cannot be scoped to a store' });
  }
  if (!data.isGlobal && !data.storeId) {
    ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'A store-scoped role requires a store' });
  }
});

export const adminRoleUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required').max(100).optional(),
  description: z.string().trim().max(500).optional(),
  isGlobal: z.boolean().optional(),
  storeId: z.string().cuid().nullable().optional(),
  permissionIds: z.array(z.string().cuid()).optional(),
}).superRefine((data, ctx) => {
  if (data.isGlobal === true && data.storeId) {
    ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'A global role cannot be scoped to a store' });
  }
  if (data.isGlobal === false && data.storeId === null) {
    ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'A store-scoped role requires a store' });
  }
});

export type AdminRoleCreateInput = z.infer<typeof adminRoleCreateSchema>;
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;

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
export const PRODUCT_SALE_UNITS = ['UNIT', 'G', 'KG', 'LB', 'OZ'] as const;
export const productSaleUnitSchema = z.enum(PRODUCT_SALE_UNITS);

export const productVariantSchema = z.object({
  productId: z.string().cuid(),
  sku: z.string().min(1, 'SKU is required').max(100, 'SKU must be less than 100 characters'),
  barcode: z.string().max(50).optional(),
  price: z.number().finite().nonnegative('Price must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Price must have at most 2 decimal places'),
  cost: z.number().finite().nonnegative('Cost must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Cost must have at most 2 decimal places'),
  saleUnit: productSaleUnitSchema.default('UNIT'),
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

export const inventoryAdjustmentSchema = z.object({
  newQuantity: z.int().min(0).max(1000000000, 'Quantity is too large'),
  reason: z.string().trim().min(1, 'Adjustment reason is required').max(200),
  notes: z.string().trim().max(500).optional(),
  referenceId: z.string().trim().max(100).optional(),
});

export const inventoryReceiptSchema = z.object({
  quantity: z.int().positive('Received quantity must be positive').max(1000000000, 'Quantity is too large'),
  referenceId: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const inventoryTransferSchema = z.object({
  targetInventoryId: z.string().cuid(),
  quantity: z.int().positive('Transfer quantity must be positive').max(1000000000, 'Quantity is too large'),
  referenceId: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

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
  subtotal: z.number().finite().nonnegative('Subtotal must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Subtotal must have at most 2 decimal places'),
  tax: z.number().finite().nonnegative('Tax must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Tax must have at most 2 decimal places').default(0),
  total: z.number().finite().nonnegative('Total must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Total must have at most 2 decimal places'),
  discount: z.number().finite().nonnegative('Discount must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Discount must have at most 2 decimal places').default(0),
  applyTax: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
});

export const saleUpdateSchema = saleSchema.partial().omit({ organizationId: true, orderNumber: true });

// SaleItem validation
export const saleItemSchema = z.object({
  saleId: z.string().cuid().optional(),
  variantId: z.string().cuid(),
  quantity: z.int().positive('Quantity must be positive'),
  unitPrice: z.number().finite().nonnegative('Unit price must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Unit price must have at most 2 decimal places').optional(),
  totalPrice: z.number().finite().nonnegative('Total price must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Total price must have at most 2 decimal places').optional(),
  discount: z.number().finite().nonnegative('Discount must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Discount must have at most 2 decimal places').default(0),
});

export const saleItemUpdateSchema = saleItemSchema.partial().omit({ saleId: true, variantId: true });

// Payment validation
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
export const idempotencyKeySchema = z.string().trim().min(1).max(IDEMPOTENCY_KEY_MAX_LENGTH);

export const paymentSchema = z.object({
  saleId: z.string().cuid().optional(),
  method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK'], {
    message: 'Invalid payment method',
  }),
  amount: z.number().finite().positive('Amount must be positive').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Amount must have at most 2 decimal places'),
  reference: z.string().max(200).optional(),
  status: z.literal('COMPLETED').default('COMPLETED'),
});

export const paymentUpdateSchema = paymentSchema.partial().omit({ saleId: true });

// Explicit customer credit authorization
export const saleCreditSchema = z.object({
  customerId: z.string().cuid(),
  amount: z.number().finite().positive('Credit amount must be positive').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Credit amount must have at most 2 decimal places'),
  note: z.string().max(1000).optional(),
});

export type SaleCreditInput = z.infer<typeof saleCreditSchema>;

// Proforma validation
export const proformaSchema = z.object({
  organizationId: z.string().cuid(),
  storeId: z.string().cuid(),
  proformaNumber: z.string().optional(),
  customerId: z.string().cuid().optional().transform(val => val === '' ? undefined : val),
  status: z.string().default('DRAFT'),
  subtotal: z.number().finite().nonnegative('Subtotal must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Subtotal must have at most 2 decimal places').default(0),
  tax: z.number().finite().nonnegative('Tax must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Tax must have at most 2 decimal places').default(0),
  taxRate: z.number().finite().nonnegative('Tax rate must be non-negative').default(0),
  total: z.number().finite().nonnegative('Total must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Total must have at most 2 decimal places').default(0),
  discount: z.number().finite().nonnegative('Discount must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Discount must have at most 2 decimal places').default(0),
  applyTax: z.boolean().default(true),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    variantId: z.string().cuid(),
    quantity: z.int().positive('Quantity must be positive'),
  })).max(100, 'A proforma cannot contain more than 100 items').optional(),
});

export const proformaUpdateSchema = proformaSchema.partial().omit({ organizationId: true, proformaNumber: true, status: true });

// ProformaItem validation
export const proformaItemSchema = z.object({
  proformaId: z.string().cuid(),
  variantId: z.string().cuid(),
  quantity: z.int().positive('Quantity must be positive'),
  unitPrice: z.number().finite().nonnegative('Unit price must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Unit price must have at most 2 decimal places'),
  totalPrice: z.number().finite().nonnegative('Total price must be non-negative').max(MAX_MONEY_12_2).refine(hasAtMostTwoDecimalPlaces, 'Total price must have at most 2 decimal places'),
  discount: z.number().finite().nonnegative('Discount must be non-negative').max(MAX_MONEY_10_2).refine(hasAtMostTwoDecimalPlaces, 'Discount must have at most 2 decimal places').default(0),
});

export const proformaItemUpdateSchema = proformaItemSchema.partial().omit({ proformaId: true, variantId: true });

// Customer validation
export const CUSTOMER_MAX_PAGE_SIZE = 100;

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  skip: z.coerce.number().int().min(0).max(1000000).default(0),
  take: z.coerce.number().int().min(1).max(CUSTOMER_MAX_PAGE_SIZE).default(50),
});

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional().or(z.literal('')),
  country: z.string().trim().length(2).toUpperCase().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
}).strict();

// Sales Report validation
// Report queries are deliberately bounded to prevent unbounded historical extraction.
export const SALES_REPORT_MAX_RANGE_DAYS = 366;
export const SALES_REPORT_MAX_PRODUCT_ROWS = 100;

const salesReportDateRangeRefinement = (data: { startDate?: Date; endDate?: Date }) => {
  if (data.startDate && data.endDate) {
    const rangeMs = data.endDate.getTime() - data.startDate.getTime();
    return rangeMs >= 0 && rangeMs <= SALES_REPORT_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  }
  return true;
};

const salesReportDateRangeMessage = {
  message: `Report date range must be between 0 and ${SALES_REPORT_MAX_RANGE_DAYS} days`,
};

export const salesReportPeriodSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  storeId: z.string().cuid().optional(),
  granularity: z.enum(['day', 'week', 'month']),
}).refine(
  (data) => salesReportDateRangeRefinement(data),
  salesReportDateRangeMessage,
);

export const salesReportProductSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  storeId: z.string().cuid().optional(),
  limit: z.number().int().positive().max(SALES_REPORT_MAX_PRODUCT_ROWS).default(50),
}).refine(
  (data) => salesReportDateRangeRefinement(data),
  salesReportDateRangeMessage,
);

export const salesReportStoreSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => salesReportDateRangeRefinement(data),
  salesReportDateRangeMessage,
);

export const salesReportSummarySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  storeId: z.string().cuid().optional(),
}).refine(
  (data) => salesReportDateRangeRefinement(data),
  salesReportDateRangeMessage,
);

export const salesReportPaymentMethodSchema = salesReportSummarySchema;

// Registration validation
export const registrationSchema = z.object({
  organizationName: z.string().min(1, 'Organization name is required').max(255, 'Organization name must be less than 255 characters'),
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password confirmation is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
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
export type RegistrationInput = z.infer<typeof registrationSchema>;
