import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { LedgerEffectModel } from '../payments-ledgers/persistence/ledger-effect.model';
import { PaymentModel } from '../payments-ledgers/persistence/payment.model';
import { AccountMovementModel } from '../accounts-expenses/persistence/account-movement.model';
import { StockMovementModel } from '../inventory/persistence/stock-movement.model';
import { SaleModel } from './persistence/sale.model';
import { InvoiceSequenceModel } from './persistence/invoice-sequence.model';
import { createSalesModule } from './sales.module';
import { createLedgersModule } from '../payments-ledgers/ledgers.module';

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F06 P1 real-Mongo sales drafts, customer payments, invoice sequences', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f06p1_${Date.now()}`;
  let mongoReady = false;
  let organizationId;
  let branchId;
  let branchBId;
  let warehouseId;
  let customerId;
  let accountId;
  let productId;
  let packagingUnitId;
  let actorId;
  let sales;
  let ledgers;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      mongoReady = await isReplicaSetPrimary();
      if (!mongoReady) {
        await mongoose.disconnect();
        return;
      }
      await Promise.all([
        SaleModel.syncIndexes(),
        InvoiceSequenceModel.syncIndexes(),
        LedgerEffectModel.syncIndexes(),
        PaymentModel.syncIndexes(),
        AccountMovementModel.syncIndexes(),
        StockMovementModel.syncIndexes(),
      ]);

      organizationId = new mongoose.Types.ObjectId();
      branchId = new mongoose.Types.ObjectId();
      branchBId = new mongoose.Types.ObjectId();
      warehouseId = new mongoose.Types.ObjectId();
      customerId = new mongoose.Types.ObjectId();
      accountId = new mongoose.Types.ObjectId();
      productId = new mongoose.Types.ObjectId();
      packagingUnitId = new mongoose.Types.ObjectId();
      actorId = new mongoose.Types.ObjectId();

      const locationsService = {
        async getBranch(orgId, id) {
          if (String(orgId) !== String(organizationId)) {
            throw new Error('not found');
          }
          if (String(id) === String(branchId)) {
            return { id: String(branchId), name: 'Main Branch', invoicePrefix: 'LHR', status: 'active' };
          }
          if (String(id) === String(branchBId)) {
            return { id: String(branchBId), name: 'Second Branch', invoicePrefix: 'ISB', status: 'active' };
          }
          throw new Error('not found');
        },
        async getWarehouse(orgId, id) {
          if (String(orgId) === String(organizationId) && String(id) === String(warehouseId)) {
            return { id: String(warehouseId), name: 'Main WH', status: 'active' };
          }
          throw new Error('not found');
        },
      };

      const customersService = {
        async getCustomer(orgId, id) {
          if (String(orgId) === String(organizationId) && String(id) === String(customerId)) {
            return { id: String(customerId), name: 'Customer A', status: 'active' };
          }
          throw new Error('not found');
        },
      };

      const catalogService = {
        async getProduct(orgId, id) {
          if (String(orgId) === String(organizationId) && String(id) === String(productId)) {
            return {
              id: String(productId),
              name: 'Widget',
              status: 'active',
              baseUnitCode: 'EA',
              trackingMode: 'none',
            };
          }
          throw new Error('not found');
        },
        async listPackagingUnits(orgId, id) {
          if (String(orgId) === String(organizationId) && String(id) === String(productId)) {
            return {
              items: [
                {
                  id: String(packagingUnitId),
                  name: 'Box',
                  conversionFactor: '1',
                  status: 'active',
                },
              ],
            };
          }
          return { items: [] };
        },
      };

      ledgers = createLedgersModule({ persistence: 'mongoose' });
      ledgers.paymentsService = ledgers.createPaymentsService({
        ledgersService: ledgers.ledgersService,
        customersService,
        accountsService: {
          async getAccount(orgId, id) {
            if (String(orgId) === String(organizationId) && String(id) === String(accountId)) {
              return { id: String(accountId), status: 'active' };
            }
            throw new Error('not found');
          },
          async postAccountMovement(session, input) {
            await AccountMovementModel.create([input], session ? { session } : undefined);
            return input;
          },
        },
        listUnpaidCustomerSales: async () => [],
      });

      sales = createSalesModule({
        persistence: 'mongoose',
        catalogService,
        customersService,
        locationsService,
      });
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const authContext = () => ({
    userId: String(actorId),
    organizationId: String(organizationId),
    permissions: ['sales.create', 'sales.view', 'customer-payments.post'],
    contextType: 'organization',
    role: 'Owner',
  });

  it('keeps sale drafts effect-free and allocates invoice numbers concurrently', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F06 P1 proof');
    }

    const draft = await sales.salesService.createSaleDraft(
      String(organizationId),
      {
        branchId: String(branchId),
        warehouseId: String(warehouseId),
        customerId: String(customerId),
        saleDate: '2026-08-12',
        lines: [
          {
            productId: String(productId),
            packagingUnitId: String(packagingUnitId),
            quantity: '2',
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      },
      authContext(),
    );
    expect(draft.status).toBe('draft');
    expect(draft.invoiceNumber).toBeNull();

    expect(await StockMovementModel.countDocuments({ organizationId })).toBe(0);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(0);
    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(0);
    expect(await InvoiceSequenceModel.countDocuments({ organizationId })).toBe(0);

    const allocations = await Promise.all(
      Array.from({ length: 6 }, () =>
        sales.transactionRunner.run(async (session) =>
          sales.salesService.allocateInvoiceNumberInSession(
            session,
            String(organizationId),
            String(branchId),
          ),
        ),
      ),
    );
    const numbers = allocations.map((item) => item.invoiceNumber);
    expect(new Set(numbers).size).toBe(6);
    expect(numbers.sort()[0]).toBe('LHR-000001');

    const branchB = await sales.transactionRunner.run(async (session) =>
      sales.salesService.allocateInvoiceNumberInSession(
        session,
        String(organizationId),
        String(branchBId),
      ),
    );
    expect(branchB.invoiceNumber).toBe('ISB-000001');

    await sales.salesService.discardSaleDraft(String(organizationId), draft.id, authContext());
    expect(await SaleModel.countDocuments({ organizationId })).toBe(0);
  });

  it('rolls back invoice sequence increment when transaction aborts', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F06 P1 proof');
    }

    const org2 = new mongoose.Types.ObjectId();
    try {
      await sales.transactionRunner.run(async (session) => {
        await sales.salesService.allocateInvoiceNumberInSession(session, String(org2), String(branchId));
        throw new Error('abort');
      });
    } catch {
      // expected
    }

    const seq = await InvoiceSequenceModel.findOne({ organizationId: org2, branchId }).lean().exec();
    expect(seq).toBeNull();
  });

  it('posts customer payment with advance while opening receivable remains', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F06 P1 proof');
    }

    const postedAt = new Date();
    await LedgerEffectModel.create({
      organizationId,
      partyType: 'customer',
      customerId,
      effectKind: 'receivable',
      signedAmountMinorUnits: '10000',
      currency: 'PKR',
      sourceType: 'customer_opening_receivable',
      sourceId: customerId,
      status: 'posted',
      postedAt,
      postedBy: actorId,
    });

    const payment = await ledgers.paymentsService.postCustomerPayment(
      String(organizationId),
      {
        customerId: String(customerId),
        accountId: String(accountId),
        amount: { amount: '150.00', currency: 'PKR' },
        paymentDate: '2026-08-12',
        allocationMode: 'general',
      },
      { actorId: String(actorId) },
      `cust-pay-mongo-${Date.now()}`,
    );
    expect(payment.data.allocations).toHaveLength(1);
    expect(payment.data.allocations[0].targetType).toBe('customer_advance');

    const effects = await LedgerEffectModel.find({ organizationId, customerId, status: 'posted' }).lean().exec();
    const receivableTotal = effects
      .filter((item) => item.effectKind === 'receivable')
      .reduce((sum, item) => sum + BigInt(item.signedAmountMinorUnits), 0n);
    expect(receivableTotal).toBe(10000n);
    expect(await PaymentModel.countDocuments({ organizationId, partyType: 'customer' })).toBe(1);
  });

  it('lists sales default sorted newest first: sequence, pagination boundary, deterministic tie breaker', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo F06 P1 proof');
    }

    await SaleModel.deleteMany({ organizationId });

    // 1. Create Sale A, Sale B, Sale C in sequence
    const saleA = await sales.salesService.createSaleDraft(
      String(organizationId),
      {
        branchId: String(branchId),
        warehouseId: String(warehouseId),
        saleDate: '2026-08-10',
        notes: 'Sale A',
        lines: [
          {
            productId: String(productId),
            packagingUnitId: String(packagingUnitId),
            quantity: '1',
            unitPrice: { amount: '10.00', currency: 'PKR' },
          },
        ],
      },
      authContext(),
    );

    const saleB = await sales.salesService.createSaleDraft(
      String(organizationId),
      {
        branchId: String(branchId),
        warehouseId: String(warehouseId),
        saleDate: '2026-08-11',
        notes: 'Sale B',
        lines: [
          {
            productId: String(productId),
            packagingUnitId: String(packagingUnitId),
            quantity: '1',
            unitPrice: { amount: '10.00', currency: 'PKR' },
          },
        ],
      },
      authContext(),
    );

    const saleC = await sales.salesService.createSaleDraft(
      String(organizationId),
      {
        branchId: String(branchId),
        warehouseId: String(warehouseId),
        saleDate: '2026-08-12',
        notes: 'Sale C',
        lines: [
          {
            productId: String(productId),
            packagingUnitId: String(packagingUnitId),
            quantity: '1',
            unitPrice: { amount: '10.00', currency: 'PKR' },
          },
        ],
      },
      authContext(),
    );

    const listABC = await sales.salesService.listSales(
      String(organizationId),
      {},
      authContext(),
    );
    expect(listABC.items.map((i) => i.id)).toEqual([saleC.id, saleB.id, saleA.id]);

    // 2. Test pagination boundary: create 26 more sales (total 29)
    for (let i = 1; i <= 26; i++) {
      const day = String(13 + Math.floor(i / 2)).padStart(2, '0');
      await sales.salesService.createSaleDraft(
        String(organizationId),
        {
          branchId: String(branchId),
          warehouseId: String(warehouseId),
          saleDate: `2026-08-${day}`,
          notes: `Extra ${i}`,
          lines: [
            {
              productId: String(productId),
              packagingUnitId: String(packagingUnitId),
              quantity: '1',
              unitPrice: { amount: '10.00', currency: 'PKR' },
            },
          ],
        },
        authContext(),
      );
    }

    const page1 = await sales.salesService.listSales(
      String(organizationId),
      { skip: 0, pageSize: 25 },
      authContext(),
    );
    const page2 = await sales.salesService.listSales(
      String(organizationId),
      { skip: 25, pageSize: 25 },
      authContext(),
    );

    expect(page1.total).toBe(29);
    expect(page1.items).toHaveLength(25);
    expect(page2.items).toHaveLength(4);

    // Verify all 29 items are distinct across pages (pagination-safe, no duplicates/jumping)
    const allIds = [...page1.items.map((i) => i.id), ...page2.items.map((i) => i.id)];
    expect(new Set(allIds).size).toBe(29);

    // Verify page 1 items have saleDate >= page 2 items
    const minPage1Date = page1.items[page1.items.length - 1].saleDate;
    const maxPage2Date = page2.items[0].saleDate;
    expect(minPage1Date >= maxPage2Date).toBe(true);

    // 3. Test deterministic ordering when timestamps are equal
    const sameDate = '2026-10-01';
    const sameCreatedAt = new Date('2026-10-01T12:00:00.000Z');
    const id1 = new mongoose.Types.ObjectId();
    const id2 = new mongoose.Types.ObjectId();
    const [lowerId, higherId] = [id1, id2].sort((a, b) => a.toString().localeCompare(b.toString()));

    await SaleModel.create([
      {
        _id: lowerId,
        organizationId,
        branchId,
        warehouseId,
        saleDate: sameDate,
        createdAt: sameCreatedAt,
        lines: [
          {
            productId,
            productNameSnapshot: 'P',
            unitCodeSnapshot: 'U',
            conversionFactorSnapshot: '1',
            enteredQuantityMinorUnits: '100',
            quantityBaseMinorUnits: '100',
            unitPriceMinorUnits: '1000',
            lineProductAmountMinorUnits: '1000',
          },
        ],
        createdBy: actorId,
      },
      {
        _id: higherId,
        organizationId,
        branchId,
        warehouseId,
        saleDate: sameDate,
        createdAt: sameCreatedAt,
        lines: [
          {
            productId,
            productNameSnapshot: 'P',
            unitCodeSnapshot: 'U',
            conversionFactorSnapshot: '1',
            enteredQuantityMinorUnits: '100',
            quantityBaseMinorUnits: '100',
            unitPriceMinorUnits: '1000',
            lineProductAmountMinorUnits: '1000',
          },
        ],
        createdBy: actorId,
      },
    ]);

    const tieCheck = await sales.salesService.listSales(
      String(organizationId),
      { saleDate: sameDate },
      authContext(),
    );
    expect(tieCheck.items.map((i) => i.id)).toEqual([higherId.toString(), lowerId.toString()]);
  });
});
