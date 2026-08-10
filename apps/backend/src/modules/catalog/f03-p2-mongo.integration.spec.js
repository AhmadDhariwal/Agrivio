import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { ProductCategoryModel } from './persistence/product-category.model';
import { ProductModel } from './persistence/product.model';
import { ProductPackagingUnitModel } from './persistence/product-packaging-unit.model';
import { ProductPriceModel } from './persistence/product-price.model';
import { CustomerModel } from '../customers/persistence/customer.model';
import { SupplierModel } from '../suppliers/persistence/supplier.model';
import { AccountModel } from '../accounts-expenses/persistence/account.model';

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F03 P2 master-data Mongo indexes', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f03p2_${Date.now()}`;
  let mongoReady = false;

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
        ProductCategoryModel.syncIndexes(),
        ProductModel.syncIndexes(),
        ProductPackagingUnitModel.syncIndexes(),
        ProductPriceModel.syncIndexes(),
        CustomerModel.syncIndexes(),
        SupplierModel.syncIndexes(),
        AccountModel.syncIndexes(),
      ]);
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

  it('enforces unique category, packaging, price, supplier, and account keys', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo index proof');
    }
    const organizationId = new mongoose.Types.ObjectId();
    const category = await ProductCategoryModel.create({
      organizationId,
      name: 'Seeds',
      nameNormalized: 'seeds',
      productClass: 'seed',
      status: 'active',
      version: 1,
    });
    await expect(
      ProductCategoryModel.create({
        organizationId,
        name: 'Seeds Dup',
        nameNormalized: 'seeds',
        productClass: 'seed',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const product = await ProductModel.create({
      organizationId,
      categoryId: category._id,
      name: 'Wheat Seed',
      nameNormalized: 'wheat seed',
      sku: 'WHEAT-1',
      trackingMode: 'batch',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
      status: 'active',
      version: 1,
    });
    await expect(
      ProductModel.create({
        organizationId,
        categoryId: category._id,
        name: 'Other',
        nameNormalized: 'other',
        sku: 'WHEAT-1',
        trackingMode: 'batch',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await ProductPackagingUnitModel.create({
      organizationId,
      productId: product._id,
      name: '10 KG',
      nameNormalized: '10 kg',
      conversionFactor: '10',
      status: 'active',
      version: 1,
    });
    await expect(
      ProductPackagingUnitModel.create({
        organizationId,
        productId: product._id,
        name: '10 KG bag',
        nameNormalized: '10 kg',
        conversionFactor: '10',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await ProductPriceModel.create({
      organizationId,
      productId: product._id,
      priceTier: 'retail',
      amountMinorUnits: '10000',
      currency: 'PKR',
      status: 'active',
      version: 1,
    });
    await expect(
      ProductPriceModel.create({
        organizationId,
        productId: product._id,
        priceTier: 'retail',
        amountMinorUnits: '11000',
        currency: 'PKR',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await SupplierModel.create({
      organizationId,
      name: 'Supplier A',
      nameNormalized: 'supplier a',
      status: 'active',
      version: 1,
    });
    await expect(
      SupplierModel.create({
        organizationId,
        name: 'Supplier A2',
        nameNormalized: 'supplier a',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await AccountModel.create({
      organizationId,
      accountType: 'cash',
      name: 'Cash Desk',
      nameNormalized: 'cash desk',
      status: 'active',
      version: 1,
    });
    await expect(
      AccountModel.create({
        organizationId,
        accountType: 'bank',
        name: 'Cash Desk',
        nameNormalized: 'cash desk',
        bankName: 'HBL',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('isolates tenant uniqueness across organizations', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo index proof');
    }
    const orgA = new mongoose.Types.ObjectId();
    const orgB = new mongoose.Types.ObjectId();
    await ProductCategoryModel.create({
      organizationId: orgA,
      name: 'Shared Name',
      nameNormalized: 'shared name',
      productClass: 'general',
      status: 'active',
      version: 1,
    });
    await expect(
      ProductCategoryModel.create({
        organizationId: orgB,
        name: 'Shared Name',
        nameNormalized: 'shared name',
        productClass: 'general',
        status: 'active',
        version: 1,
      }),
    ).resolves.toBeTruthy();
  });
});
