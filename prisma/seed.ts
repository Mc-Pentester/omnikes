import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;

const prisma = new PrismaClient({
  adapter,
  log: ['error'],
});

async function main() {
  console.log('🌱 Starting OmniKès test data seed...');

  // ============================================================
  // ORGANIZATIONS
  // ============================================================

  const orgA = await prisma.organization.upsert({
    where: { slug: 'omnikes-test-commerce-a' },
    update: {},
    create: {
      name: 'OmniKès Test Commerce A',
      slug: 'omnikes-test-commerce-a',
      country: 'HT',
      currency: 'HTG',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      cloudEnabled: false,
      onlineStoreEnabled: false,
    },
  });

  const orgB = await prisma.organization.upsert({
    where: { slug: 'omnikes-test-commerce-b' },
    update: {},
    create: {
      name: 'OmniKès Test Commerce B',
      slug: 'omnikes-test-commerce-b',
      country: 'HT',
      currency: 'HTG',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      cloudEnabled: false,
      onlineStoreEnabled: false,
    },
  });

  console.log('✅ Organizations created:', { orgA: orgA.id, orgB: orgB.id });

  // ============================================================
  // USERS
  // ============================================================

  const passwordHashA = await bcrypt.hash('OmniKesTestA!2026', 10);
  const passwordHashCashierA = await bcrypt.hash('OmniKesCashierA!2026', 10);
  const passwordHashB = await bcrypt.hash('OmniKesTestB!2026', 10);

  const adminA = await prisma.user.upsert({
    where: { email: 'admin.a@omnikes.test' },
    update: {},
    create: {
      email: 'admin.a@omnikes.test',
      name: 'Admin Test A',
      password: passwordHashA,
      organizationId: orgA.id,
      isActive: true,
    },
  });

  const cashierA = await prisma.user.upsert({
    where: { email: 'cashier.a@omnikes.test' },
    update: {},
    create: {
      email: 'cashier.a@omnikes.test',
      name: 'Cashier Test A',
      password: passwordHashCashierA,
      organizationId: orgA.id,
      isActive: true,
    },
  });

  const adminB = await prisma.user.upsert({
    where: { email: 'admin.b@omnikes.test' },
    update: {},
    create: {
      email: 'admin.b@omnikes.test',
      name: 'Admin Test B',
      password: passwordHashB,
      organizationId: orgB.id,
      isActive: true,
    },
  });

  console.log('✅ Users created:', { adminA: adminA.id, cashierA: cashierA.id, adminB: adminB.id });

  // ============================================================
  // ROLES
  // ============================================================

  const adminRoleA = await prisma.role.upsert({
    where: { id: 'admin-role-a' },
    update: {},
    create: {
      id: 'admin-role-a',
      name: 'ADMIN',
      description: 'Administrator role for test organization A',
      isGlobal: true,
    },
  });

  const cashierRoleA = await prisma.role.upsert({
    where: { id: 'cashier-role-a' },
    update: {},
    create: {
      id: 'cashier-role-a',
      name: 'CASHIER',
      description: 'Cashier role for test organization A',
      isGlobal: true,
    },
  });

  const adminRoleB = await prisma.role.upsert({
    where: { id: 'admin-role-b' },
    update: {},
    create: {
      id: 'admin-role-b',
      name: 'ADMIN',
      description: 'Administrator role for test organization B',
      isGlobal: true,
    },
  });

  console.log('✅ Roles created');

  // ============================================================
  // USER ROLES
  // ============================================================

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminA.id, roleId: adminRoleA.id } },
    update: {},
    create: {
      userId: adminA.id,
      roleId: adminRoleA.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: cashierA.id, roleId: cashierRoleA.id } },
    update: {},
    create: {
      userId: cashierA.id,
      roleId: cashierRoleA.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminB.id, roleId: adminRoleB.id } },
    update: {},
    create: {
      userId: adminB.id,
      roleId: adminRoleB.id,
    },
  });

  console.log('✅ User roles assigned');

  // ============================================================
  // STORES
  // ============================================================

  const storeA = await prisma.store.upsert({
    where: { id: 'test-store-a' },
    update: {},
    create: {
      id: 'test-store-a',
      organizationId: orgA.id,
      name: 'OmniKès Test Store A',
      code: 'STORE-A',
      address: '123 Test Street A',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 1234 5678',
      email: 'store.a@omnikes.test',
      isActive: true,
    },
  });

  const storeB = await prisma.store.upsert({
    where: { id: 'test-store-b' },
    update: {},
    create: {
      id: 'test-store-b',
      organizationId: orgB.id,
      name: 'OmniKès Test Store B',
      code: 'STORE-B',
      address: '456 Test Street B',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 8765 4321',
      email: 'store.b@omnikes.test',
      isActive: true,
    },
  });

  console.log('✅ Stores created:', { storeA: storeA.id, storeB: storeB.id });

  // ============================================================
  // PRODUCTS - ORGANIZATION A
  // ============================================================

  const productRiceA = await prisma.product.upsert({
    where: { id: 'product-rice-a' },
    update: {},
    create: {
      id: 'product-rice-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Riz 5kg',
      description: 'Riz de qualité 5kg - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantRiceA = await prisma.productVariant.upsert({
    where: { sku: 'RICE-A-5KG' },
    update: {},
    create: {
      productId: productRiceA.id,
      sku: 'RICE-A-5KG',
      barcode: '1111111111111',
      price: 250.00,
      cost: 180.00,
      attributes: { size: '5kg' },
      isActive: true,
    },
  });

  const productOilA = await prisma.product.upsert({
    where: { id: 'product-oil-a' },
    update: {},
    create: {
      id: 'product-oil-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Huile 1L',
      description: 'Huile végétale 1L - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantOilA = await prisma.productVariant.upsert({
    where: { sku: 'OIL-A-1L' },
    update: {},
    create: {
      productId: productOilA.id,
      sku: 'OIL-A-1L',
      barcode: '1111111111112',
      price: 150.00,
      cost: 100.00,
      attributes: { size: '1L' },
      isActive: true,
    },
  });

  const productSugarA = await prisma.product.upsert({
    where: { id: 'product-sugar-a' },
    update: {},
    create: {
      id: 'product-sugar-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Sucre 1kg',
      description: 'Sucre blanc 1kg - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantSugarA = await prisma.productVariant.upsert({
    where: { sku: 'SUGAR-A-1KG' },
    update: {},
    create: {
      productId: productSugarA.id,
      sku: 'SUGAR-A-1KG',
      barcode: '1111111111113',
      price: 80.00,
      cost: 50.00,
      attributes: { size: '1kg' },
      isActive: true,
    },
  });

  const productWaterA = await prisma.product.upsert({
    where: { id: 'product-water-a' },
    update: {},
    create: {
      id: 'product-water-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Eau 1.5L',
      description: 'Eau minérale 1.5L - Test Organization A',
      category: 'Boissons',
      isActive: true,
    },
  });

  const variantWaterA = await prisma.productVariant.upsert({
    where: { sku: 'WATER-A-1.5L' },
    update: {},
    create: {
      productId: productWaterA.id,
      sku: 'WATER-A-1.5L',
      barcode: '1111111111114',
      price: 35.00,
      cost: 20.00,
      attributes: { size: '1.5L' },
      isActive: true,
    },
  });

  const productSoapA = await prisma.product.upsert({
    where: { id: 'product-soap-a' },
    update: {},
    create: {
      id: 'product-soap-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Savon',
      description: 'Savon de toilette - Test Organization A',
      category: 'Hygiène',
      isActive: true,
    },
  });

  const variantSoapA = await prisma.productVariant.upsert({
    where: { sku: 'SOAP-A' },
    update: {},
    create: {
      productId: productSoapA.id,
      sku: 'SOAP-A',
      barcode: '1111111111115',
      price: 45.00,
      cost: 25.00,
      attributes: {},
      isActive: true,
    },
  });

  console.log('✅ Products A created');

  // ============================================================
  // PRODUCTS - ORGANIZATION B
  // ============================================================

  const productRiceB = await prisma.product.upsert({
    where: { id: 'product-rice-b' },
    update: {},
    create: {
      id: 'product-rice-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Riz 10kg',
      description: 'Riz de qualité 10kg - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantRiceB = await prisma.productVariant.upsert({
    where: { sku: 'RICE-B-10KG' },
    update: {},
    create: {
      productId: productRiceB.id,
      sku: 'RICE-B-10KG',
      barcode: '2222222222221',
      price: 450.00,
      cost: 350.00,
      attributes: { size: '10kg' },
      isActive: true,
    },
  });

  const productOilB = await prisma.product.upsert({
    where: { id: 'product-oil-b' },
    update: {},
    create: {
      id: 'product-oil-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Huile 2L',
      description: 'Huile végétale 2L - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantOilB = await prisma.productVariant.upsert({
    where: { sku: 'OIL-B-2L' },
    update: {},
    create: {
      productId: productOilB.id,
      sku: 'OIL-B-2L',
      barcode: '2222222222222',
      price: 280.00,
      cost: 190.00,
      attributes: { size: '2L' },
      isActive: true,
    },
  });

  const productCoffeeB = await prisma.product.upsert({
    where: { id: 'product-coffee-b' },
    update: {},
    create: {
      id: 'product-coffee-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Café',
      description: 'Café moulu 500g - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantCoffeeB = await prisma.productVariant.upsert({
    where: { sku: 'COFFEE-B-500G' },
    update: {},
    create: {
      productId: productCoffeeB.id,
      sku: 'COFFEE-B-500G',
      barcode: '2222222222223',
      price: 350.00,
      cost: 250.00,
      attributes: { size: '500g' },
      isActive: true,
    },
  });

  const productMilkB = await prisma.product.upsert({
    where: { id: 'product-milk-b' },
    update: {},
    create: {
      id: 'product-milk-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Lait',
      description: 'Lait en poudre 1kg - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantMilkB = await prisma.productVariant.upsert({
    where: { sku: 'MILK-B-1KG' },
    update: {},
    create: {
      productId: productMilkB.id,
      sku: 'MILK-B-1KG',
      barcode: '2222222222224',
      price: 420.00,
      cost: 300.00,
      attributes: { size: '1kg' },
      isActive: true,
    },
  });

  const productBiscuitB = await prisma.product.upsert({
    where: { id: 'product-biscuit-b' },
    update: {},
    create: {
      id: 'product-biscuit-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Biscuit',
      description: 'Biscuits paquet 200g - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantBiscuitB = await prisma.productVariant.upsert({
    where: { sku: 'BISCUIT-B-200G' },
    update: {},
    create: {
      productId: productBiscuitB.id,
      sku: 'BISCUIT-B-200G',
      barcode: '2222222222225',
      price: 75.00,
      cost: 45.00,
      attributes: { size: '200g' },
      isActive: true,
    },
  });

  console.log('✅ Products B created');

  // ============================================================
  // INVENTORY - ORGANIZATION A
  // ============================================================

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantRiceA.id } },
    update: { quantity: 100 },
    create: {
      storeId: storeA.id,
      variantId: variantRiceA.id,
      quantity: 100,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantOilA.id } },
    update: { quantity: 80 },
    create: {
      storeId: storeA.id,
      variantId: variantOilA.id,
      quantity: 80,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantSugarA.id } },
    update: { quantity: 120 },
    create: {
      storeId: storeA.id,
      variantId: variantSugarA.id,
      quantity: 120,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantWaterA.id } },
    update: { quantity: 200 },
    create: {
      storeId: storeA.id,
      variantId: variantWaterA.id,
      quantity: 200,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantSoapA.id } },
    update: { quantity: 75 },
    create: {
      storeId: storeA.id,
      variantId: variantSoapA.id,
      quantity: 75,
      reservedQuantity: 0,
    },
  });

  console.log('✅ Inventory A created');

  // ============================================================
  // INVENTORY - ORGANIZATION B
  // ============================================================

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantRiceB.id } },
    update: { quantity: 50 },
    create: {
      storeId: storeB.id,
      variantId: variantRiceB.id,
      quantity: 50,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantOilB.id } },
    update: { quantity: 60 },
    create: {
      storeId: storeB.id,
      variantId: variantOilB.id,
      quantity: 60,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantCoffeeB.id } },
    update: { quantity: 90 },
    create: {
      storeId: storeB.id,
      variantId: variantCoffeeB.id,
      quantity: 90,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantMilkB.id } },
    update: { quantity: 100 },
    create: {
      storeId: storeB.id,
      variantId: variantMilkB.id,
      quantity: 100,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantBiscuitB.id } },
    update: { quantity: 150 },
    create: {
      storeId: storeB.id,
      variantId: variantBiscuitB.id,
      quantity: 150,
      reservedQuantity: 0,
    },
  });

  console.log('✅ Inventory B created');

  // ============================================================
  // CUSTOMERS
  // ============================================================

  const customerA = await prisma.customer.upsert({
    where: { id: 'customer-a' },
    update: {},
    create: {
      id: 'customer-a',
      organizationId: orgA.id,
      name: 'Client Test A',
      email: 'client.a@omnikes.test',
      phone: '+509 1111 1111',
      address: '789 Customer Street A',
      city: 'Port-au-Prince',
      country: 'HT',
      isActive: true,
    },
  });

  const customerB = await prisma.customer.upsert({
    where: { id: 'customer-b' },
    update: {},
    create: {
      id: 'customer-b',
      organizationId: orgB.id,
      name: 'Client Test B',
      email: 'client.b@omnikes.test',
      phone: '+509 2222 2222',
      address: '321 Customer Street B',
      city: 'Port-au-Prince',
      country: 'HT',
      isActive: true,
    },
  });

  console.log('✅ Customers created');

  // ============================================================
  // SALES - ORGANIZATION A (Historical data with different dates)
  // ============================================================

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  // Sale A1 - Today
  const saleA1 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-A-001' },
    update: {},
    create: {
      id: 'sale-a-001',
      organizationId: orgA.id,
      storeId: storeA.id,
      orderNumber: 'SALE-A-001',
      customerId: customerA.id,
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 335.00,
      tax: 60.30,
      total: 395.30,
      discount: 0,
      createdAt: today,
      updatedAt: today,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a1-1' },
    update: {},
    create: {
      id: 'sale-item-a1-1',
      saleId: saleA1.id,
      variantId: variantRiceA.id,
      quantity: 1,
      unitPrice: 250.00,
      totalPrice: 250.00,
      discount: 0,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a1-2' },
    update: {},
    create: {
      id: 'sale-item-a1-2',
      saleId: saleA1.id,
      variantId: variantWaterA.id,
      quantity: 2,
      unitPrice: 35.00,
      totalPrice: 70.00,
      discount: 0,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a1-3' },
    update: {},
    create: {
      id: 'sale-item-a1-3',
      saleId: saleA1.id,
      variantId: variantSoapA.id,
      quantity: 1,
      unitPrice: 45.00,
      totalPrice: 45.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-a1' },
    update: {},
    create: {
      id: 'payment-a1',
      saleId: saleA1.id,
      method: 'CASH',
      amount: 395.30,
      reference: 'CASH-A-001',
      status: 'COMPLETED',
      createdAt: today,
    },
  });

  // Sale A2 - Yesterday
  const saleA2 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-A-002' },
    update: {},
    create: {
      id: 'sale-a-002',
      organizationId: orgA.id,
      storeId: storeA.id,
      orderNumber: 'SALE-A-002',
      customerId: customerA.id,
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 230.00,
      tax: 41.40,
      total: 271.40,
      discount: 0,
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a2-1' },
    update: {},
    create: {
      id: 'sale-item-a2-1',
      saleId: saleA2.id,
      variantId: variantOilA.id,
      quantity: 1,
      unitPrice: 150.00,
      totalPrice: 150.00,
      discount: 0,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a2-2' },
    update: {},
    create: {
      id: 'sale-item-a2-2',
      saleId: saleA2.id,
      variantId: variantSugarA.id,
      quantity: 1,
      unitPrice: 80.00,
      totalPrice: 80.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-a2' },
    update: {},
    create: {
      id: 'payment-a2',
      saleId: saleA2.id,
      method: 'CARD',
      amount: 271.40,
      reference: 'CARD-A-002',
      status: 'COMPLETED',
      createdAt: yesterday,
    },
  });

  // Sale A3 - Last week
  const saleA3 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-A-003' },
    update: {},
    create: {
      id: 'sale-a-003',
      organizationId: orgA.id,
      storeId: storeA.id,
      orderNumber: 'SALE-A-003',
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 500.00,
      tax: 90.00,
      total: 590.00,
      discount: 0,
      createdAt: lastWeek,
      updatedAt: lastWeek,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-a3-1' },
    update: {},
    create: {
      id: 'sale-item-a3-1',
      saleId: saleA3.id,
      variantId: variantRiceA.id,
      quantity: 2,
      unitPrice: 250.00,
      totalPrice: 500.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-a3' },
    update: {},
    create: {
      id: 'payment-a3',
      saleId: saleA3.id,
      method: 'CASH',
      amount: 590.00,
      reference: 'CASH-A-003',
      status: 'COMPLETED',
      createdAt: lastWeek,
    },
  });

  console.log('✅ Sales A created');

  // ============================================================
  // SALES - ORGANIZATION B (Historical data with different dates)
  // ============================================================

  // Sale B1 - Today
  const saleB1 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-B-001' },
    update: {},
    create: {
      id: 'sale-b-001',
      organizationId: orgB.id,
      storeId: storeB.id,
      orderNumber: 'SALE-B-001',
      customerId: customerB.id,
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 730.00,
      tax: 131.40,
      total: 861.40,
      discount: 0,
      createdAt: today,
      updatedAt: today,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-b1-1' },
    update: {},
    create: {
      id: 'sale-item-b1-1',
      saleId: saleB1.id,
      variantId: variantRiceB.id,
      quantity: 1,
      unitPrice: 450.00,
      totalPrice: 450.00,
      discount: 0,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-b1-2' },
    update: {},
    create: {
      id: 'sale-item-b1-2',
      saleId: saleB1.id,
      variantId: variantCoffeeB.id,
      quantity: 1,
      unitPrice: 350.00,
      totalPrice: 350.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-b1' },
    update: {},
    create: {
      id: 'payment-b1',
      saleId: saleB1.id,
      method: 'CASH',
      amount: 861.40,
      reference: 'CASH-B-001',
      status: 'COMPLETED',
      createdAt: today,
    },
  });

  // Sale B2 - Yesterday
  const saleB2 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-B-002' },
    update: {},
    create: {
      id: 'sale-b-002',
      organizationId: orgB.id,
      storeId: storeB.id,
      orderNumber: 'SALE-B-002',
      customerId: customerB.id,
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 495.00,
      tax: 89.10,
      total: 584.10,
      discount: 0,
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-b2-1' },
    update: {},
    create: {
      id: 'sale-item-b2-1',
      saleId: saleB2.id,
      variantId: variantMilkB.id,
      quantity: 1,
      unitPrice: 420.00,
      totalPrice: 420.00,
      discount: 0,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-b2-2' },
    update: {},
    create: {
      id: 'sale-item-b2-2',
      saleId: saleB2.id,
      variantId: variantBiscuitB.id,
      quantity: 1,
      unitPrice: 75.00,
      totalPrice: 75.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-b2' },
    update: {},
    create: {
      id: 'payment-b2',
      saleId: saleB2.id,
      method: 'CARD',
      amount: 584.10,
      reference: 'CARD-B-002',
      status: 'COMPLETED',
      createdAt: yesterday,
    },
  });

  // Sale B3 - Two days ago
  const saleB3 = await prisma.sale.upsert({
    where: { orderNumber: 'SALE-B-003' },
    update: {},
    create: {
      id: 'sale-b-003',
      organizationId: orgB.id,
      storeId: storeB.id,
      orderNumber: 'SALE-B-003',
      channel: 'POS',
      status: 'COMPLETED',
      subtotal: 280.00,
      tax: 50.40,
      total: 330.40,
      discount: 0,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    },
  });

  await prisma.saleItem.upsert({
    where: { id: 'sale-item-b3-1' },
    update: {},
    create: {
      id: 'sale-item-b3-1',
      saleId: saleB3.id,
      variantId: variantOilB.id,
      quantity: 1,
      unitPrice: 280.00,
      totalPrice: 280.00,
      discount: 0,
    },
  });

  await prisma.payment.upsert({
    where: { id: 'payment-b3' },
    update: {},
    create: {
      id: 'payment-b3',
      saleId: saleB3.id,
      method: 'CASH',
      amount: 330.40,
      reference: 'CASH-B-003',
      status: 'COMPLETED',
      createdAt: twoDaysAgo,
    },
  });

  console.log('✅ Sales B created');

  // ============================================================
  // PROFORMAS - ORGANIZATION A
  // ============================================================

  const proformaA1 = await prisma.proforma.upsert({
    where: { proformaNumber: 'PROF-A-001' },
    update: {},
    create: {
      id: 'proforma-a-001',
      organizationId: orgA.id,
      storeId: storeA.id,
      proformaNumber: 'PROF-A-001',
      customerId: customerA.id,
      status: 'SENT',
      subtotal: 250.00,
      tax: 45.00,
      total: 295.00,
      discount: 0,
      validUntil: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  });

  await prisma.proformaItem.upsert({
    where: { id: 'proforma-item-a1-1' },
    update: {},
    create: {
      id: 'proforma-item-a1-1',
      proformaId: proformaA1.id,
      variantId: variantRiceA.id,
      quantity: 1,
      unitPrice: 250.00,
      totalPrice: 250.00,
      discount: 0,
    },
  });

  console.log('✅ Proformas A created');

  // ============================================================
  // PROFORMAS - ORGANIZATION B
  // ============================================================

  const proformaB1 = await prisma.proforma.upsert({
    where: { proformaNumber: 'PROF-B-001' },
    update: {},
    create: {
      id: 'proforma-b-001',
      organizationId: orgB.id,
      storeId: storeB.id,
      proformaNumber: 'PROF-B-001',
      customerId: customerB.id,
      status: 'SENT',
      subtotal: 450.00,
      tax: 81.00,
      total: 531.00,
      discount: 0,
      validUntil: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: yesterday,
      updatedAt: yesterday,
    },
  });

  await prisma.proformaItem.upsert({
    where: { id: 'proforma-item-b1-1' },
    update: {},
    create: {
      id: 'proforma-item-b1-1',
      proformaId: proformaB1.id,
      variantId: variantRiceB.id,
      quantity: 1,
      unitPrice: 450.00,
      totalPrice: 450.00,
      discount: 0,
    },
  });

  console.log('✅ Proformas B created');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('Test Users:');
  console.log('  admin.a@omnikes.test / OmniKesTestA!2026 (Organization A)');
  console.log('  cashier.a@omnikes.test / OmniKesCashierA!2026 (Organization A)');
  console.log('  admin.b@omnikes.test / OmniKesTestB!2026 (Organization B)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
