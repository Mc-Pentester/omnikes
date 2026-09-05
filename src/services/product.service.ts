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

    return productRepository.create({
      name: validatedData.name,
      description: validatedData.description,
      category: validatedData.category,
      isActive: validatedData.isActive,
      organization: {
        connect: { id: organizationId },
      },
    });
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
