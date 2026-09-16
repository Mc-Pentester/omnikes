import { productRepository } from '@omnikes/repositories/product.repository';
import { productSchema, productUpdateSchema, ProductInput, ProductUpdateInput } from '@omnikes/lib/validation';
import { Prisma } from '@prisma/client';

export class ProductService {
  /**
   * Create a new product with validation
   */
  async create(organizationId: string, data: ProductInput) {
    // Validate input
    const validatedData = productSchema.parse({
      ...data,
      organizationId,
    });

    const variants = (data as any).variants;
    
    const productData: any = {
      name: validatedData.name,
      description: validatedData.description,
      category: validatedData.category,
      isActive: validatedData.isActive,
      organization: {
        connect: { id: organizationId },
      },
    };

    // Add variants if provided
    if (variants && Array.isArray(variants) && variants.length > 0) {
      productData.variants = {
        create: variants.map((v: any) => ({
          sku: v.sku,
          price: v.price,
          cost: v.cost || 0,
          barcode: v.barcode || null,
          attributes: v.attributes || {},
          isActive: true,
        })),
      };
    }

    const product = await productRepository.create(productData);

    // Create inventory entries for all active stores
    if (product.variants && product.variants.length > 0) {
      const { inventoryRepository } = await import('@omnikes/repositories/inventory.repository');
      const { storeRepository } = await import('@omnikes/repositories/store.repository');
      
      const storesResult = await storeRepository.listByOrganization(organizationId, { isActive: true });
      const activeStores = storesResult.stores;
      
      for (const store of activeStores) {
        for (const variant of product.variants) {
          await inventoryRepository.findOrCreate(store.id, variant.id);
        }
      }
    }

    return product;
  }

  /**
   * Get a product by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const product = await productRepository.findById(id, organizationId);
    
    if (!product) {
      throw new Error('Product not found or access denied');
    }

    return product;
  }

  /**
   * List products for an organization
   */
  async list(organizationId: string, options: {
    search?: string;
    category?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    return productRepository.listByOrganization(organizationId, options);
  }

  /**
   * Update a product with validation
   */
  async update(id: string, organizationId: string, data: ProductUpdateInput) {
    // Check if product exists and belongs to organization
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product not found or access denied');
    }

    // Validate input
    const validatedData = productUpdateSchema.parse(data);

    await productRepository.update(id, organizationId, validatedData as Prisma.ProductUpdateInput);
    
    return productRepository.findById(id, organizationId);
  }

  /**
   * Deactivate a product (soft delete)
   */
  async deactivate(id: string, organizationId: string) {
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product not found or access denied');
    }

    await productRepository.deactivate(id, organizationId);
    
    return productRepository.findById(id, organizationId);
  }

  /**
   * Activate a product
   */
  async activate(id: string, organizationId: string) {
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Product not found or access denied');
    }

    await productRepository.activate(id, organizationId);
    
    return productRepository.findById(id, organizationId);
  }

  /**
   * Search products by name
   */
  async search(organizationId: string, query: string) {
    return productRepository.listByOrganization(organizationId, {
      search: query,
    });
  }

  /**
   * Get products by category
   */
  async getByCategory(organizationId: string, category: string) {
    return productRepository.listByOrganization(organizationId, {
      category,
    });
  }

  /**
   * Get active products only
   */
  async getActive(organizationId: string) {
    return productRepository.listByOrganization(organizationId, {
      isActive: true,
    });
  }
}

export const productService = new ProductService();
