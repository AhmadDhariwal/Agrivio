import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { createCatalogModule } = require('../catalog/catalog.module');
const { createImportsModule } = require('./imports.module');
const { renderImportWorkbook } = require('./import-workbook');
const { ImportJobModel, ImportRowErrorModel } = require('./persistence/import-job.model');
const { ProductCategoryModel } = require('../catalog/persistence/product-category.model');
const { ProductModel } = require('../catalog/persistence/product.model');
const { evaluateNumericLimit } = require('../subscriptions/entitlement');

const actor = { actorId: 'owner-1', authContext: { userId: 'owner-1', organizationId: null } };

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F08 P3 import Mongo transactions', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f08p3_${Date.now()}`;
  let mongoReady = false;
  let organizationId;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      return;
    }
    mongoReady = await isReplicaSetPrimary();
    if (!mongoReady) {
      await mongoose.disconnect();
      return;
    }
    await Promise.all([ImportJobModel.syncIndexes(), ImportRowErrorModel.syncIndexes()]);
    organizationId = String(new mongoose.Types.ObjectId());
    actor.authContext.organizationId = organizationId;
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('rolls back all business rows on a midway failure', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo transaction proof');
    }

    const catalog = createCatalogModule({
      persistence: 'mongoose',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const imports = createImportsModule({
      persistence: 'mongoose',
      catalogService: catalog.catalogService,
      resolvePlanEntitlements: async () => ({ imports: true }),
    });

    const job = await imports.importsService.createJob(
      organizationId,
      { importType: 'product_categories' },
      actor,
    );
    await imports.importsService.uploadWorkbook(
      organizationId,
      job.id,
      {
        buffer: renderImportWorkbook('product_categories', [
          { name: 'Alpha', productClass: 'general' },
          { name: 'Beta', productClass: 'general' },
        ]),
      },
      actor,
    );
    await imports.importsService.validateJob(organizationId, job.id, actor.authContext);
    await imports.importsService.confirmJob(organizationId, job.id, actor);

    await expect(
      imports.importsService.executeJob(organizationId, job.id, actor, 'mongo-fail', {
        failAfterRow: 1,
      }),
    ).rejects.toThrow(/Forced import execution failure/);

    const remaining = await ProductCategoryModel.countDocuments({ organizationId }).exec();
    expect(remaining).toBe(0);
    const failed = await imports.importsService.getJob(organizationId, job.id);
    expect(failed.status).toBe('failed');
    expect(failed.failureMessage).toMatch(/Forced/);
  });

  it('does not duplicate effects on concurrent execute', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo concurrency proof');
    }

    const catalog = createCatalogModule({
      persistence: 'mongoose',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const imports = createImportsModule({
      persistence: 'mongoose',
      catalogService: catalog.catalogService,
      resolvePlanEntitlements: async () => ({ imports: true }),
    });

    const job = await imports.importsService.createJob(
      organizationId,
      { importType: 'product_categories' },
      actor,
    );
    await imports.importsService.uploadWorkbook(
      organizationId,
      job.id,
      {
        buffer: renderImportWorkbook('product_categories', [
          { name: 'Gamma', productClass: 'general' },
        ]),
      },
      actor,
    );
    await imports.importsService.validateJob(organizationId, job.id, actor.authContext);
    await imports.importsService.confirmJob(organizationId, job.id, actor);

    const results = await Promise.allSettled([
      imports.importsService.executeJob(organizationId, job.id, actor, 'mongo-conc'),
      imports.importsService.executeJob(organizationId, job.id, actor, 'mongo-conc'),
    ]);
    const count = await ProductCategoryModel.countDocuments({
      organizationId,
      nameNormalized: 'gamma',
    }).exec();
    expect(count).toBe(1);
    expect(results.some((item) => item.status === 'fulfilled')).toBe(true);
  });

  it('preflights product quota in the Mongo transaction and leaves no partial over-limit rows', async ({
    skip,
  }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo transaction proof');
    }

    const evaluateEntitlement = async (_organizationId, { limitKey, currentUsage }) =>
      evaluateNumericLimit({ limits: { products: 2 } }, limitKey, currentUsage);
    const catalog = createCatalogModule({ persistence: 'mongoose', evaluateEntitlement });
    const imports = createImportsModule({
      persistence: 'mongoose',
      catalogService: catalog.catalogService,
      resolvePlanEntitlements: async () => ({ imports: true }),
      evaluateEntitlement,
    });
    const category = await catalog.catalogService.createCategory(
      organizationId,
      { name: 'Quota General', productClass: 'general' },
      actor,
    );
    await catalog.catalogService.createProduct(
      organizationId,
      {
        sku: 'QUOTA-EXISTING',
        name: 'Quota Existing',
        categoryId: category.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      },
      actor,
    );
    const row = (sku) => ({
      sku,
      name: sku,
      categoryName: 'Quota General',
      trackingMode: 'none',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    });
    const job = await imports.importsService.createJob(
      organizationId,
      { importType: 'products' },
      actor,
    );
    await imports.importsService.uploadWorkbook(
      organizationId,
      job.id,
      { buffer: renderImportWorkbook('products', [row('QUOTA-2'), row('QUOTA-3')]) },
      actor,
    );
    await imports.importsService.validateJob(organizationId, job.id, actor.authContext);
    await imports.importsService.confirmJob(organizationId, job.id, actor);

    await expect(
      imports.importsService.executeJob(organizationId, job.id, actor, 'mongo-product-quota'),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(ProductModel.countDocuments({ organizationId }).exec()).resolves.toBe(1);
  });

  it('uses a database constraint to serialize distinct same-resource import jobs', async ({
    skip,
  }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo concurrency proof');
    }

    const isolatedOrganizationId = String(new mongoose.Types.ObjectId());
    const imports = createImportsModule({ persistence: 'mongoose' });
    const first = await imports.store.insertJob(null, {
      organizationId: isolatedOrganizationId,
      importType: 'products',
      templateVersion: 1,
      status: 'confirmed',
      version: 1,
    });
    const second = await imports.store.insertJob(null, {
      organizationId: isolatedOrganizationId,
      importType: 'products',
      templateVersion: 1,
      status: 'confirmed',
      version: 1,
    });

    await expect(
      imports.store.claimExecute(isolatedOrganizationId, String(first._id)),
    ).resolves.toMatchObject({ status: 'executing' });
    await expect(
      imports.store.claimExecute(isolatedOrganizationId, String(second._id)),
    ).rejects.toMatchObject({ agrivioConcurrentImport: true });
  });
});
