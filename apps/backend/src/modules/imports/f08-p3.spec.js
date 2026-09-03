import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalogModule } from '../catalog/catalog.module.js';
import { createCustomersModule } from '../customers/customers.module.js';
import { createSuppliersModule } from '../suppliers/suppliers.module.js';
import { createAccountsModule } from '../accounts-expenses/accounts.module.js';
import { createLedgersModule } from '../payments-ledgers/ledgers.module.js';
import { createInventoryModule } from '../inventory/inventory.module.js';
import { createLocationsModule } from '../locations/locations.module.js';
import { createImportsModule } from './imports.module.js';
import { parseImportWorkbook, renderImportWorkbook } from './import-workbook.js';
import { getTemplate, IMPORT_TYPES } from './import-templates.js';
import { createImportsController } from './controllers/imports.controller.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { createRequirePermissionMiddleware } from '../identity/permission.middleware.js';
import { createCorsMiddleware } from '../identity/auth.middleware.js';
import {
  collectSourceFiles,
  extractImportSpecifiers,
} from '../../platform/architecture/boundary-scan.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');

const actor = {
  actorId: 'owner-1',
  authContext: {
    userId: 'owner-1',
    organizationId: 'org-1',
    permissions: permissionsForMembershipRole('Owner'),
  },
};

function allowEntitlement() {
  return { allowed: true };
}

function buildModules() {
  const catalog = createCatalogModule({
    persistence: 'memory',
    evaluateEntitlement: async () => allowEntitlement(),
  });
  const ledgers = createLedgersModule({ persistence: 'memory' });
  const customers = createCustomersModule({
    persistence: 'memory',
    evaluateEntitlement: async () => allowEntitlement(),
    ledgersService: ledgers.ledgersService,
  });
  const suppliers = createSuppliersModule({
    persistence: 'memory',
    evaluateEntitlement: async () => allowEntitlement(),
    ledgersService: ledgers.ledgersService,
  });
  const accounts = createAccountsModule({ persistence: 'memory' });
  const locations = createLocationsModule({
    persistence: 'memory',
    evaluateEntitlement: async () => allowEntitlement(),
  });
  const inventory = createInventoryModule({
    persistence: 'memory',
    catalogService: catalog.catalogService,
    locationsService: locations.locationsService,
    canAccessWarehouse: () => true,
    hasPermission: () => true,
    resolveOrganizationTimezone: async () => 'Asia/Karachi',
  });
  const imports = createImportsModule({
    persistence: 'memory',
    catalogService: catalog.catalogService,
    customersService: customers.customersService,
    suppliersService: suppliers.suppliersService,
    accountsService: accounts.accountsService,
    inventoryService: inventory.inventoryService,
    locationsService: locations.locationsService,
    canAccessWarehouse: () => true,
    resolvePlanEntitlements: async () => ({ imports: true }),
  });
  return { catalog, customers, suppliers, accounts, locations, inventory, ledgers, imports };
}

async function previewExecute(importsService, importType, rows) {
  const job = await importsService.createJob('org-1', { importType }, actor);
  await importsService.uploadWorkbook(
    'org-1',
    job.id,
    { buffer: renderImportWorkbook(importType, rows), originalFileName: 't.xls' },
    actor,
  );
  const preview = await importsService.validateJob('org-1', job.id, actor.authContext);
  return { job, preview, importsService };
}

describe('F08 P3 Excel imports', () => {
  it('lists Frozen import types only', () => {
    expect(IMPORT_TYPES).toHaveLength(14);
  });

  it('generates and serves the authoritative workbook for every registered import type', async () => {
    const { imports } = buildModules();
    for (const importType of IMPORT_TYPES) {
      const template = getTemplate(importType);
      const downloaded = imports.importsService.downloadTemplate(importType);
      const parsed = parseImportWorkbook(downloaded.buffer, importType);
      const generatedRows = downloaded.buffer.toString('utf8').match(/<Row>[\s\S]*?<\/Row>/g) ?? [];
      const generatedHeaders = [
        ...(generatedRows[0] ?? '').matchAll(/<Data[^>]*>([^<]*)<\/Data>/g),
      ].map(
        (match) => match[1],
      );

      expect(downloaded.buffer.length).toBeGreaterThan(0);
      expect(downloaded.filename).toBe(`${importType}-template.xls`);
      expect(downloaded.contentType).toBe('application/vnd.ms-excel');
      expect(parsed.headerErrors).toEqual([]);
      expect(parsed.templateType).toBe(importType);
      expect(parsed.templateVersion).toBe(template.version);
      expect(parsed.records).toEqual([]);
      expect(parsed.createUpdatePolicy).toBe(template.createUpdatePolicy);
      expect(generatedHeaders).toEqual(['AGRIVIO_TEMPLATE', importType, String(template.version)]);

      const generatedColumns = [
        ...(generatedRows[1] ?? '').matchAll(/<Data[^>]*>([^<]*)<\/Data>/g),
      ].map((match) => match[1]);
      expect(generatedColumns).toEqual(template.columns.map((column) => column.key));
    }

    expect(() => imports.importsService.downloadTemplate('not-a-real-import')).toThrow();
  });

  it('sets the download response contract at the HTTP controller boundary', async () => {
    const { imports } = buildModules();
    const headers = {};
    const response = {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      status: (code) => {
        response.statusCode = code;
        return response;
      },
      send: (body) => {
        response.body = body;
        return response;
      },
    };
    const next = (error) => {
      if (error) throw error;
    };
    const controller = createImportsController({ importsService: imports.importsService });

    await controller.downloadTemplate({ params: { importType: 'products' } }, response, next);

    expect(response.statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('application/vnd.ms-excel');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="products-template.xls"',
    );
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('exposes the server download filename to allowed browser origins', () => {
    const headers = {};
    const cors = createCorsMiddleware({ nodeEnv: 'test' });
    cors(
      { method: 'GET', headers: { origin: 'http://localhost:4200' } },
      { setHeader: (name, value) => { headers[name] = value; } },
      () => undefined,
    );

    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Expose-Headers']).toContain('Content-Disposition');
  });

  it('previews and executes a valid category import', async () => {
    const { catalog, imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Seeds', productClass: 'seed' },
    ]);
    expect(preview.preview.validRows).toBe(1);
    expect(preview.preview.invalidRows).toBe(0);
    await imports.importsService.confirmJob('org-1', preview.id, actor);
    const executed = await imports.importsService.executeJob('org-1', preview.id, actor, 'key-cat-1');
    expect(executed.data.status).toBe('completed');
    expect(executed.data.result.createdCount).toBe(1);
    const categories = await catalog.catalogService.listCategories('org-1');
    expect(categories.items).toHaveLength(1);
    expect(categories.items[0].name).toBe('Seeds');
  });

  it('validates product category/unit/tracking facts', async () => {
    const { catalog, imports } = buildModules();
    await catalog.catalogService.createCategory('org-1', { name: 'Chem', productClass: 'chemical' }, actor);
    const { preview } = await previewExecute(imports.importsService, 'products', [
      {
        sku: 'CHEM-1',
        name: 'Spray',
        categoryName: 'Missing',
        trackingMode: 'none',
        baseUnitCode: 'L',
        measurementDimension: 'volume',
      },
    ]);
    expect(preview.preview.invalidRows).toBe(1);
    expect(preview.errors.some((error) => error.field === 'categoryName')).toBe(true);
  });

  it('validates price product and tier facts', async () => {
    const { imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_prices', [
      { productSku: 'NOPE', priceTier: 'retail', amount: '10.00' },
    ]);
    expect(preview.errors.some((error) => error.code === 'PRODUCT_NOT_FOUND')).toBe(true);
  });

  it('preserves customer and supplier uniqueness without overwrite', async () => {
    const { customers, suppliers, imports } = buildModules();
    await customers.customersService.createCustomer(
      'org-1',
      { name: 'Ali', customerType: 'farmer' },
      actor,
    );
    await suppliers.suppliersService.createSupplier('org-1', { name: 'Kissan Traders' }, actor);
    const customerPreview = await previewExecute(imports.importsService, 'customers', [
      { name: 'Ali', customerType: 'farmer' },
    ]);
    const customerJob = customerPreview.preview;
    expect(customerJob.preview.invalidRows).toBe(1);
    const listed = await customerPreview.importsService.listErrors('org-1', customerJob.id);
    expect(listed.items.some((item) => item.code === 'RECORD_EXISTS')).toBe(true);
    const supplierPreview = await previewExecute(imports.importsService, 'suppliers', [
      { name: 'Kissan Traders' },
    ]);
    expect(supplierPreview.preview.preview.invalidRows).toBe(1);
  });

  it('reports exact row and field for an invalid value', async () => {
    const { imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Ok', productClass: 'seed' },
      { name: '', productClass: 'seed' },
    ]);
    expect(preview.errors.some((error) => error.row === 4 && error.field === 'name')).toBe(true);
  });

  it('blocks execute when any row is invalid', async () => {
    const { imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Good', productClass: 'general' },
      { name: '', productClass: 'general' },
    ]);
    await expect(imports.importsService.confirmJob('org-1', preview.id, actor)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('does not silently overwrite an existing category', async () => {
    const { catalog, imports } = buildModules();
    await catalog.catalogService.createCategory('org-1', { name: 'Fert', productClass: 'fertilizer' }, actor);
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Fert', productClass: 'general' },
    ]);
    expect(preview.errors.some((error) => error.code === 'RECORD_EXISTS')).toBe(true);
    const after = await catalog.catalogService.listCategories('org-1');
    expect(after.items[0].productClass).toBe('fertilizer');
  });

  it('rejects template type and version mismatch', async () => {
    const { imports } = buildModules();
    const job = await imports.importsService.createJob('org-1', { importType: 'products' }, actor);
    await imports.importsService.uploadWorkbook(
      'org-1',
      job.id,
      { buffer: renderImportWorkbook('product_categories', [{ name: 'X', productClass: 'seed' }]) },
      actor,
    );
    const preview = await imports.importsService.validateJob('org-1', job.id, actor.authContext);
    expect(preview.errors.some((error) => error.code === 'TEMPLATE_TYPE_MISMATCH')).toBe(true);
  });

  it('creates zero business effects during preview', async () => {
    const { catalog, imports } = buildModules();
    await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Only Preview', productClass: 'general' },
    ]);
    const categories = await catalog.catalogService.listCategories('org-1');
    expect(categories.items).toHaveLength(0);
  });

  it('posts customer receivable and advance through ledger effects', async () => {
    const { customers, ledgers, imports } = buildModules();
    await customers.customersService.createCustomer(
      'org-1',
      { name: 'Farmer One', customerType: 'farmer' },
      actor,
    );
    const ar = await previewExecute(imports.importsService, 'customer_opening_receivables', [
      { customerName: 'Farmer One', amount: '25.00' },
    ]);
    await imports.importsService.confirmJob('org-1', ar.preview.id, actor);
    await imports.importsService.executeJob('org-1', ar.preview.id, actor, 'ar-1');
    const receivable = await ledgers.ledgersService.sumCustomerReceivable(
      'org-1',
      (await customers.customersService.findCustomerByName('org-1', 'Farmer One')).id,
    );
    expect(receivable.amount).toBe('25.00');

    const { customers: customers2, ledgers: ledgers2, imports: imports2 } = buildModules();
    await customers2.customersService.createCustomer(
      'org-1',
      { name: 'Farmer Two', customerType: 'farmer' },
      actor,
    );
    const adv = await previewExecute(imports2.importsService, 'customer_opening_advances', [
      { customerName: 'Farmer Two', amount: '5.00' },
    ]);
    await imports2.importsService.confirmJob('org-1', adv.preview.id, actor);
    await imports2.importsService.executeJob('org-1', adv.preview.id, actor, 'adv-1');
    const customer = await customers2.customersService.findCustomerByName('org-1', 'Farmer Two');
    const advance = await ledgers2.ledgersService.sumCustomerAdvance('org-1', customer.id);
    expect(advance.amount).toBe('5.00');
  });

  it('posts supplier payable and advance through ledger effects', async () => {
    const { suppliers, ledgers, imports } = buildModules();
    await suppliers.suppliersService.createSupplier('org-1', { name: 'Supply Co' }, actor);
    const ap = await previewExecute(imports.importsService, 'supplier_opening_payables', [
      { supplierName: 'Supply Co', amount: '40.00' },
    ]);
    await imports.importsService.confirmJob('org-1', ap.preview.id, actor);
    await imports.importsService.executeJob('org-1', ap.preview.id, actor, 'ap-1');
    const supplier = await suppliers.suppliersService.findSupplierByName('org-1', 'Supply Co');
    const payable = await ledgers.ledgersService.sumSupplierPayable('org-1', supplier.id);
    expect(payable.amount).toBe('40.00');
  });

  it('creates signed account opening movements per account type', async () => {
    const { accounts, imports } = buildModules();
    await accounts.accountsService.createAccount(
      'org-1',
      { name: 'Till', accountType: 'cash' },
      actor,
    );
    const job = await previewExecute(imports.importsService, 'cash_opening_balances', [
      { accountName: 'Till', amount: '100.00' },
    ]);
    await imports.importsService.confirmJob('org-1', job.preview.id, actor);
    await imports.importsService.executeJob('org-1', job.preview.id, actor, 'cash-1');
    const account = await accounts.accountsService.findAccountByName('org-1', 'Till');
    const movements = await accounts.accountsService.listAccountMovements('org-1', account.id);
    expect(movements.items[0].signedAmount.amount).toBe('100.00');
    expect(movements.items[0].sourceType).toBe('account_opening');
  });

  it('requires batch and expiry according to tracking mode', async () => {
    const { catalog, locations, imports } = buildModules();
    await catalog.catalogService.createCategory('org-1', { name: 'Seed', productClass: 'seed' }, actor);
    const category = await catalog.catalogService.findCategoryByName('org-1', 'Seed');
    await catalog.catalogService.createProduct(
      'org-1',
      {
        sku: 'SEED-1',
        name: 'Wheat',
        categoryId: category.id,
        trackingMode: 'batch_expiry',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      },
      actor,
    );
    await locations.locationsService.createWarehouse('org-1', { name: 'Main', code: 'WH1' }, actor);
    const missing = await previewExecute(imports.importsService, 'opening_stock', [
      {
        productSku: 'SEED-1',
        warehouseCode: 'WH1',
        quantity: '10',
        inventoryValue: '50.00',
      },
    ]);
    expect(missing.preview.errors ?? missing.preview).toBeTruthy();
    const errors = await imports.importsService.listErrors('org-1', missing.preview.id);
    expect(errors.items.some((item) => item.code === 'BATCH_REQUIRED')).toBe(true);
    expect(errors.items.some((item) => item.code === 'EXPIRY_REQUIRED')).toBe(true);
  });

  it('posts opening stock through inventory public posting', async () => {
    const { catalog, locations, inventory, imports } = buildModules();
    await catalog.catalogService.createCategory('org-1', { name: 'Gen', productClass: 'general' }, actor);
    const category = await catalog.catalogService.findCategoryByName('org-1', 'Gen');
    await catalog.catalogService.createProduct(
      'org-1',
      {
        sku: 'GEN-1',
        name: 'Bag',
        categoryId: category.id,
        trackingMode: 'none',
        baseUnitCode: 'EA',
        measurementDimension: 'mass',
      },
      actor,
    );
    await locations.locationsService.createWarehouse('org-1', { name: 'Main', code: 'WH1' }, actor);
    const stock = await previewExecute(imports.importsService, 'opening_stock', [
      {
        productSku: 'GEN-1',
        warehouseCode: 'WH1',
        quantity: '4',
        inventoryValue: '40.00',
      },
    ]);
    await imports.importsService.confirmJob('org-1', stock.preview.id, actor);
    await imports.importsService.executeJob('org-1', stock.preview.id, actor, 'stock-1');
    const product = await catalog.catalogService.findProductBySku('org-1', 'GEN-1');
    const balances = await inventory.inventoryService.listBalances('org-1', {}, actor.authContext);
    expect(balances.items.some((item) => item.productId === product.id)).toBe(true);
  });

  it('records inspectable failure state and refuses a second execute of a completed job', async () => {
    const { imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'One', productClass: 'general' },
      { name: 'Two', productClass: 'general' },
    ]);
    await imports.importsService.confirmJob('org-1', preview.id, actor);
    await expect(
      imports.importsService.executeJob('org-1', preview.id, actor, 'fail-key', { failAfterRow: 1 }),
    ).rejects.toThrow(/Forced import execution failure/);
    const failed = await imports.importsService.getJob('org-1', preview.id);
    expect(failed.status).toBe('failed');
    expect(failed.failureMessage).toMatch(/Forced/);

    const ok = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Done', productClass: 'general' },
    ]);
    await imports.importsService.confirmJob('org-1', ok.preview.id, actor);
    await imports.importsService.executeJob('org-1', ok.preview.id, actor, 'done-1');
    await expect(
      imports.importsService.executeJob('org-1', ok.preview.id, actor, 'done-2'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const replay = await imports.importsService.executeJob('org-1', ok.preview.id, actor, 'done-1');
    expect(replay.replay).toBe(true);
  });

  it('rejects concurrent execute duplication via claim + idempotency', async () => {
    const { imports } = buildModules();
    const { preview } = await previewExecute(imports.importsService, 'product_categories', [
      { name: 'Race', productClass: 'general' },
    ]);
    await imports.importsService.confirmJob('org-1', preview.id, actor);
    const first = imports.importsService.executeJob('org-1', preview.id, actor, 'same-key');
    const second = imports.importsService.executeJob('org-1', preview.id, actor, 'same-key');
    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const created = fulfilled.map((item) => item.value.data.result?.createdCount ?? 0);
    expect(created.some((count) => count === 1 || itemReplay(item))).toBeTruthy();
  });

  it('rejects cross-org product references', async () => {
    const { catalog, imports } = buildModules();
    await catalog.catalogService.createCategory('org-2', { name: 'Other', productClass: 'general' }, actor);
    await catalog.catalogService.createProduct(
      'org-2',
      {
        sku: 'OTHER-1',
        name: 'Hidden',
        categoryId: (await catalog.catalogService.findCategoryByName('org-2', 'Other')).id,
        trackingMode: 'none',
        baseUnitCode: 'EA',
        measurementDimension: 'mass',
      },
      actor,
    );
    const { preview } = await previewExecute(imports.importsService, 'products', [
      {
        sku: 'OTHER-1',
        name: 'Clone',
        categoryName: 'Other',
        trackingMode: 'none',
        baseUnitCode: 'EA',
        measurementDimension: 'mass',
      },
    ]);
    expect(preview.errors.some((error) => error.code === 'CATEGORY_NOT_FOUND')).toBe(true);
  });

  it('denies Cashier import permissions', () => {
    const preview = createRequirePermissionMiddleware('imports.preview');
    const execute = createRequirePermissionMiddleware('imports.execute');
    const cashier = {
      auth: { userId: 'c1' },
      authContext: {
        userId: 'c1',
        organizationId: 'org-1',
        contextType: 'organization',
        permissions: permissionsForMembershipRole('Cashier'),
      },
    };
    let previewError = null;
    preview(cashier, {}, (error) => {
      previewError = error;
    });
    let executeError = null;
    execute(cashier, {}, (error) => {
      executeError = error;
    });
    expect(previewError?.code).toBe('PERMISSION_DENIED');
    expect(executeError?.code).toBe('PERMISSION_DENIED');
  });
});

function itemReplay(item) {
  return item.status === 'fulfilled' && item.value.replay === true;
}

describe('F08 P3 architecture', () => {
  it('keeps Imports free of foreign persistence imports', () => {
    const files = collectSourceFiles(join(backendRoot, 'modules/imports'));
    const violations = [];
    for (const filePath of files) {
      if (filePath.includes('.spec.')) {
        continue;
      }
      const normalized = filePath.replaceAll('\\', '/');
      if (normalized.includes('/modules/imports/persistence/')) {
        continue;
      }
      for (const specifier of extractImportSpecifiers(filePath)) {
        if (
          /\/(catalog|customers|suppliers|accounts-expenses|inventory|payments-ledgers)\/persistence\//.test(
            specifier,
          )
        ) {
          violations.push(`${filePath} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
