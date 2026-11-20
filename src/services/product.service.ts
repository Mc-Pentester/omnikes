import { productRepository } from '@omnikes/repositories/product.repository';
import { productSchema, productUpdateSchema, ProductInput, ProductUpdateInput, ProductVariantInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

type ProductVariantCreateInput = Omit<ProductVariantInput, 'productId'>;

export class ProductService {
  /**
   * Create the product, its store inventory rows and optional initial stock
   * in one transaction. A failed initial receipt cannot leave a partial product.
   */
  async create(
    organizationId: string,
    data: ProductInput & { variants?: ProductVariantCreateInput[] },
    initialStock?: { storeId: string; quantity: number },
  ) {
    const validatedData = productSchema.parse({ ...data, organizationId });
    const variants = data.variants ?? [];

    if (initialStock && (!Number.isInteger(initialStock.quantity) || initialStock.quantity < 0)) {
      throw new Error('Initial stock quantity must be a non-negative integer');
    }
    if (initialStock && initialStock.quantity > 0 && (!initialStock.storeId || variants.length === 0)) {
      throw new Error('An active store and at least one product variant are required for initial stock');
    }

    const productData: Prisma.ProductCreateInput = {
      name: validatedData.name,
      description: validatedData.description,
      category: validatedData.category,
      isActive: validatedData.isActive,
      organization: { connect: { id: organizationId } },
      ...(variants.length > 0 ? {
        variants: {
          create: variants.map((variant: ProductVariantCreateInput) => ({
            sku: variant.sku,
            price: variant.price,
            cost: variant.cost || 0,
            saleUnit: variant.saleUnit,
            barcode: variant.barcode?.trim() || null,
            attributes: variant.attributes || {},
            isActive: true,
          })),
        },
      } : {}),
    };

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: productData, include: { variants: true } });

      if (product.variants.length > 0) {
        const stores = await tx.store.findMany({
          where: { organizationId, isActive: true },
          select: { id: true },
        });

        if (initialStock && initialStock.quantity > 0 &&
            !stores.some((store) => store.id === initialStock.storeId)) {
          throw new Error('Initial stock store not found, inactive, or access denied');
        }

        await tx.inventory.createMany({
          data: stores.flatMap((store) =>
            product.variants.map((variant, index) => ({
              storeId: store.id,
              variantId: variant.id,
              quantity: initialStock && initialStock.quantity > 0 &&
                store.id === initialStock.storeId && index === 0
                ? initialStock.quantity : 0,
              reservedQuantity: 0,
            })),
          ),
        });

        if (initialStock && initialStock.quantity > 0) {
          const inventory = await tx.inventory.findUniqueOrThrow({
            where: {
              storeId_variantId: {
                storeId: initialStock.storeId,
                variantId: product.variants[0].id,
              },
            },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: 'PURCHASE',
              quantity: initialStock.quantity,
              referenceId: product.id,
              referenceType: 'INVENTORY_INITIAL',
              notes: 'Stock initial à la création du produit',
            },
          });
        }
      }

      return product;
    });
  }

  async getByBarcode(organizationId: string, barcode: string) {
    if (!barcode.trim()) return null;
    return productRepository.findByBarcode(organizationId, barcode);
  }

  async getById(id: string, organizationId: string) {
    const product = await productRepository.findById(id, organizationId);
    if (!product) throw new Error('Product not found or access denied');
    return product;
  }

  async list(organizationId: string, options: {
    search?: string; category?: string; isActive?: boolean; authorizedStoreIds?: string[] | null; skip?: number; take?: number;
  } = {}) {
    return productRepository.listByOrganization(organizationId, options);
  }

  async update(id: string, organizationId: string, data: ProductUpdateInput) {
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    if (!exists) throw new Error('Product not found or access denied');
    const validatedData = productUpdateSchema.parse(data);
    const { barcode, variantId, price, cost, ...productData } = validatedData;
    return prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { id, organizationId }, data: productData as Prisma.ProductUpdateManyMutationInput });
      if (barcode !== undefined || price !== undefined || cost !== undefined) {
        const variant = await tx.productVariant.findFirst({
          where: { id: variantId, productId: id },
          select: { id: true },
        });
        if (!variant) throw new Error('Selected product variant not found');
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            ...(barcode !== undefined ? { barcode: barcode.trim() || null } : {}),
            ...(price !== undefined ? { price } : {}),
            ...(cost !== undefined ? { cost } : {}),
          },
        });
      }
      return tx.product.findFirst({ where: { id, organizationId }, include: { variants: true } });
    });
  }

  async deactivate(id: string, organizationId: string) {
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    if (!exists) throw new Error('Product not found or access denied');
    await productRepository.deactivate(id, organizationId);
    return productRepository.findById(id, organizationId);
  }

  async activate(id: string, organizationId: string) {
    const exists = await productRepository.belongsToOrganization(id, organizationId);
    if (!exists) throw new Error('Product not found or access denied');
    await productRepository.activate(id, organizationId);
    return productRepository.findById(id, organizationId);
  }

  async search(organizationId: string, query: string) {
    return productRepository.listByOrganization(organizationId, { search: query });
  }

  async getByCategory(organizationId: string, category: string) {
    return productRepository.listByOrganization(organizationId, { category });
  }

  async getActive(organizationId: string) {
    return productRepository.listByOrganization(organizationId, { isActive: true });
  }
}

export const productService = new ProductService();
