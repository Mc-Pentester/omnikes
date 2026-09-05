import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { productRepository } from '@omnikes/repositories/product.repository';
import { productVariantSchema, productVariantUpdateSchema, ProductVariantInput, ProductVariantUpdateInput } from '@omnikes/lib/validation';
import { Prisma } from '@prisma/client';

export class ProductVariantService {
  /**
   * Create a new product variant with validation
   */
  async create(productId: string, organizationId: string, data: ProductVariantInput) {
    // Check if product exists and belongs to organization
    const productExists = await productRepository.belongsToOrganization(productId, organizationId);
    
    if (!productExists) {
      throw new Error('Product not found or access denied');
    }

    // Validate input
    const validatedData = productVariantSchema.parse({
      ...data,
      productId,
    });

    // Check SKU uniqueness
    const isSkuUnique = await productVariantRepository.isSkuUnique(validatedData.sku);
    if (!isSkuUnique) {
      throw new Error('SKU already exists');
    }

    return productVariantRepository.create({
      sku: validatedData.sku,
      barcode: validatedData.barcode,
      price: validatedData.price,
      cost: validatedData.cost,
      attributes: validatedData.attributes as Prisma.InputJsonValue,
      isActive: validatedData.isActive,
      product: {
        connect: { id: productId },
      },
    });
  }

  /**
   * Get a variant by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const variant = await productVariantRepository.findByIdWithOrganizationCheck(id, organizationId);
    
    if (!variant) {
      throw new Error('Product variant not found or access denied');
    }

    return variant;
  }

  /**
   * List variants for a product
   */
  async listByProduct(productId: string, organizationId: string, options: {
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    // Check if product belongs to organization
    const productExists = await productRepository.belongsToOrganization(productId, organizationId);
    
    if (!productExists) {
      throw new Error('Product not found or access denied');
    }

    return productVariantRepository.listByProduct(productId, options);
  }

  /**
   * List variants for an organization
   */
  async listByOrganization(organizationId: string, options: {
    search?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    return productVariantRepository.listByOrganization(organizationId, options);
  }

  /**
   * Update a variant with validation
   */
  async update(id: string, organizationId: string, data: ProductVariantUpdateInput) {
    // Check if variant exists and belongs to organization
    const exists = await productVariantRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product variant not found or access denied');
    }

    // Validate input
    const validatedData = productVariantUpdateSchema.parse(data);

    // Check SKU uniqueness if SKU is being updated
    if (validatedData.sku) {
      const isSkuUnique = await productVariantRepository.isSkuUnique(validatedData.sku, id);
      if (!isSkuUnique) {
        throw new Error('SKU already exists');
      }
    }

    await productVariantRepository.update(id, organizationId, validatedData as Prisma.ProductVariantUpdateInput);
    
    return productVariantRepository.findByIdWithOrganizationCheck(id, organizationId);
  }

  /**
   * Deactivate a variant (soft delete)
   */
  async deactivate(id: string, organizationId: string) {
    const exists = await productVariantRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product variant not found or access denied');
    }

    await productVariantRepository.deactivate(id, organizationId);
    
    return productVariantRepository.findByIdWithOrganizationCheck(id, organizationId);
  }

  /**
   * Activate a variant
   */
  async activate(id: string, organizationId: string) {
    const exists = await productVariantRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product variant not found or access denied');
    }

    await productVariantRepository.activate(id, organizationId);
    
    return productVariantRepository.findByIdWithOrganizationCheck(id, organizationId);
  }

  /**
   * Find variant by SKU
   */
  async getBySku(sku: string, organizationId: string) {
    const variant = await productVariantRepository.findBySku(sku);
    
    if (!variant) {
      throw new Error('Product variant not found');
    }

    // Check organization access
    if (variant.product.organizationId !== organizationId) {
      throw new Error('Access denied');
    }

    return variant;
  }

  /**
   * Find variant by barcode
   */
  async getByBarcode(barcode: string, organizationId: string) {
    const variant = await productVariantRepository.findByBarcode(barcode);
    
    if (!variant) {
      throw new Error('Product variant not found');
    }

    // Check organization access
    if (variant.product.organizationId !== organizationId) {
      throw new Error('Access denied');
    }

    return variant;
  }

  /**
   * Search variants by SKU or barcode
   */
  async search(organizationId: string, query: string) {
    return productVariantRepository.listByOrganization(organizationId, {
      search: query,
    });
  }

  /**
   * Get active variants only
   */
  async getActive(organizationId: string) {
    return productVariantRepository.listByOrganization(organizationId, {
      isActive: true,
    });
  }
}

export const productVariantService = new ProductVariantService();
