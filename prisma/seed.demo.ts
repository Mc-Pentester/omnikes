import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to run the demo seed');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ['error'] });
const DEMO_ORG_SLUG = 'omnikes-test-commerce-a';

async function main() {
  console.log('🌱 Starting OmniKès demo fixtures...');
  const organization = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, include: { stores: true } });
  if (!organization) throw new Error('Run the base test seed first: organization omnikes-test-commerce-a not found');
  const store = organization.stores.find((item) => item.code === 'STORE-A');
  if (!store) throw new Error('Run the base test seed first: STORE-A not found');

  const variants = await prisma.productVariant.findMany({
    where: { product: { organizationId: organization.id } },
    orderBy: { sku: 'asc' },
    take: 5,
  });
  if (variants.length < 3) throw new Error('Demo fixtures require at least 3 seeded product variants');

  const customers = [
    ['demo-customer-1', 'Jean Pierre', 'jean.pierre@demo.omnikes.test', '+509 3700 1001'],
    ['demo-customer-2', 'Marie Louis', 'marie.louis@demo.omnikes.test', '+509 3700 1002'],
    ['demo-customer-3', 'Patrick Joseph', 'patrick.joseph@demo.omnikes.test', '+509 3700 1003'],
    ['demo-customer-4', 'Sonia Charles', 'sonia.charles@demo.omnikes.test', '+509 3700 1004'],
    ['demo-customer-5', 'Nadia Michel', 'nadia.michel@demo.omnikes.test', '+509 3700 1005'],
  ] as const;

  const customerRecords = [];
  for (const [id, name, email, phone] of customers) {
    customerRecords.push(await prisma.customer.upsert({
      where: { id },
      update: { organizationId: organization.id, name, email, phone, city: 'Port-au-Prince', country: 'HT', isActive: true },
      create: { id, organizationId: organization.id, name, email, phone, city: 'Port-au-Prince', country: 'HT', isActive: true },
    }));
  }

  const taxConfiguration = organization.taxConfigurationId
    ? await prisma.taxConfiguration.findUnique({ where: { id: organization.taxConfigurationId } })
    : null;
  const taxRate = taxConfiguration ? Number(taxConfiguration.taxRate) : 0;
  const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

  const saleFixtures = [
    { n: 1, customer: 0, variant: 0, qty: 2, price: 250, daysAgo: 1, status: 'COMPLETED' },
    { n: 2, customer: 1, variant: 1, qty: 3, price: 150, daysAgo: 2, status: 'COMPLETED' },
    { n: 3, customer: 2, variant: 2, qty: 5, price: 80, daysAgo: 4, status: 'COMPLETED' },
    { n: 4, customer: 3, variant: 3, qty: 4, price: 35, daysAgo: 7, status: 'COMPLETED' },
    { n: 5, customer: 4, variant: 4, qty: 3, price: 45, daysAgo: 12, status: 'COMPLETED' },
    { n: 6, customer: 0, variant: 0, qty: 1, price: 250, daysAgo: 16, status: 'COMPLETED' },
    { n: 7, customer: 1, variant: 1, qty: 2, price: 150, daysAgo: 20, status: 'PENDING' },
  ] as const;

  for (const fixture of saleFixtures) {
    const orderNumber = 'DEMO-' + String(fixture.n).padStart(4, '0');
    const subtotal = fixture.qty * fixture.price;
    const applyTax = fixture.status === 'COMPLETED' && taxConfiguration !== null;
    const taxAmount = applyTax ? roundMoney(subtotal * taxRate) : 0;
    const total = roundMoney(subtotal + taxAmount);
    const createdAt = new Date(Date.now() - fixture.daysAgo * 24 * 60 * 60 * 1000);

    const sale = await prisma.sale.upsert({
      where: { orderNumber },
      update: { organizationId: organization.id, storeId: store.id, customerId: customerRecords[fixture.customer].id, channel: 'POS', status: fixture.status, subtotal, tax: taxAmount, taxRate: applyTax ? taxRate : 0, total, discount: 0, applyTax: fixture.status === 'COMPLETED' && taxConfiguration !== null, notes: 'Fixture de démonstration OmniKès', createdAt },
      create: { organizationId: organization.id, storeId: store.id, orderNumber, customerId: customerRecords[fixture.customer].id, channel: 'POS', status: fixture.status, subtotal, tax: taxAmount, taxRate: applyTax ? taxRate : 0, total, discount: 0, applyTax: fixture.status === 'COMPLETED' && taxConfiguration !== null, notes: 'Fixture de démonstration OmniKès', createdAt },
    });

    await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
    await prisma.saleItem.create({ data: { saleId: sale.id, variantId: variants[fixture.variant].id, quantity: fixture.qty, unitPrice: fixture.price, totalPrice: subtotal, discount: 0 } });
    await prisma.payment.deleteMany({ where: { saleId: sale.id } });
    if (fixture.status === 'COMPLETED' && total > 0) {
      await prisma.payment.create({ data: { saleId: sale.id, method: 'CASH', amount: total, reference: 'DEMO-PAY-' + String(fixture.n).padStart(4, '0'), status: 'COMPLETED', createdAt } });
    }
  }

  const proformas = [
    { id: 'demo-proforma-1', n: 1, customer: 0, variant: 0, qty: 4, price: 250, status: 'SENT', daysAgo: 2 },
    { id: 'demo-proforma-2', n: 2, customer: 2, variant: 1, qty: 6, price: 150, status: 'ACCEPTED', daysAgo: 5 },
    { id: 'demo-proforma-3', n: 3, customer: 4, variant: 2, qty: 10, price: 80, status: 'DRAFT', daysAgo: 1 },
  ] as const;

  for (const fixture of proformas) {
    const subtotal = fixture.qty * fixture.price;
    const applyTax = taxConfiguration !== null;
    const taxAmount = applyTax ? roundMoney(subtotal * taxRate) : 0;
    const total = roundMoney(subtotal + taxAmount);
    const createdAt = new Date(Date.now() - fixture.daysAgo * 24 * 60 * 60 * 1000);
    const proformaNumber = 'DEMO-PF-' + String(fixture.n).padStart(4, '0');

    const proforma = await prisma.proforma.upsert({
      where: { id: fixture.id },
      update: { organizationId: organization.id, storeId: store.id, proformaNumber, customerId: customerRecords[fixture.customer].id, status: fixture.status, subtotal, tax: taxAmount, taxRate: applyTax ? taxRate : 0, total, discount: 0, applyTax, validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), notes: 'Fixture de démonstration OmniKès', createdAt },
      create: { id: fixture.id, organizationId: organization.id, storeId: store.id, proformaNumber, customerId: customerRecords[fixture.customer].id, status: fixture.status, subtotal, tax: taxAmount, taxRate: applyTax ? taxRate : 0, total, discount: 0, applyTax, validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), notes: 'Fixture de démonstration OmniKès', createdAt },
    });

    await prisma.proformaItem.deleteMany({ where: { proformaId: proforma.id } });
    await prisma.proformaItem.create({ data: { proformaId: proforma.id, variantId: variants[fixture.variant].id, quantity: fixture.qty, unitPrice: fixture.price, totalPrice: subtotal, discount: 0 } });
  }

  console.log('ℹ️ Demo fiscal rate from organization configuration:', taxRate);
  console.log('✅ Demo fixtures ready: 5 customers, 7 sales (6 completed), 3 proformas');
}

main().catch((error) => { console.error('❌ Demo seed failed:', error); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
