const { createHash, randomUUID } = require('node:crypto');
const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const {
  createIdempotencyService,
  createInMemoryIdempotencyStore,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { conflict, forbidden, notFound, validationFailed } = require('../../platform/errors/app-error');
const { evaluateFeatureEntitlement } = require('../subscriptions/entitlement');
const { IMPORT_TYPES, getTemplate, listTemplates } = require('./import-templates');
const { parseImportWorkbook, renderImportWorkbook } = require('./import-workbook');
const { previewRows } = require('./import-preview');
const { ACCOUNT_TYPE_BY_IMPORT } = require('./import-templates');
const { createInMemoryImportsStore, createMongooseImportsStore } = require('./imports.store');

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    throw validationFailed('Idempotency-Key header is required', [
      { field: 'Idempotency-Key', message: 'Idempotency-Key header is required' },
    ]);
  }
  return idempotencyKey.trim();
}

function checksumOf(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function toJobDto(job, extra = {}) {
  return {
    id: String(job['_id']),
    organizationId: String(job.organizationId),
    importType: job.importType,
    templateVersion: Number(job.templateVersion ?? 1),
    status: job.status,
    storage: job.storageRef
      ? {
          storageRef: job.storageRef,
          originalFileName: job.originalFileName,
          contentType: job.contentType,
          size: job.size,
          checksum: job.checksum,
          uploadedAt: job.uploadedAt instanceof Date ? job.uploadedAt.toISOString() : job.uploadedAt,
        }
      : null,
    preview: job.preview ?? null,
    result: job.result ?? null,
    failureMessage: job.failureMessage || null,
    version: Number(job.version ?? 1),
    ...extra,
  };
}

function toErrorDto(error) {
  return {
    row: Number(error.rowNumber),
    field: error.field,
    code: error.code || undefined,
    message: error.message,
  };
}

async function executeRow(importType, row, deps, organizationId, actor, session) {
  const values = row.values;
  if (importType === 'product_categories') {
    return deps.catalogService.createCategory(
      organizationId,
      { name: values.name, productClass: values.productClass },
      actor,
      { session },
    );
  }
  if (importType === 'products') {
    const category = await deps.catalogService.findCategoryByName(organizationId, values.categoryName);
    return deps.catalogService.createProduct(
      organizationId,
      {
        sku: values.sku,
        name: values.name,
        categoryId: category.id,
        trackingMode: values.trackingMode,
        baseUnitCode: values.baseUnitCode,
        measurementDimension: values.measurementDimension,
      },
      actor,
      { session },
    );
  }
  if (importType === 'product_prices') {
    const product = await deps.catalogService.findProductBySku(organizationId, values.productSku);
    return deps.catalogService.createPrice(
      organizationId,
      product.id,
      { priceTier: values.priceTier, price: { amount: values.amount, currency: 'PKR' } },
      actor,
      { session },
    );
  }
  if (importType === 'customers') {
    const body = { name: values.name, customerType: values.customerType };
    if (values.phone) body.phone = values.phone;
    if (values.priceTier) body.priceTier = values.priceTier;
    return deps.customersService.createCustomer(organizationId, body, actor, { session });
  }
  if (importType === 'suppliers') {
    const body = { name: values.name };
    if (values.phone) body.phone = values.phone;
    return deps.suppliersService.createSupplier(organizationId, body, actor, { session });
  }
  if (importType === 'customer_opening_receivables' || importType === 'customer_opening_advances') {
    const customer = await deps.customersService.findCustomerByName(organizationId, values.customerName);
    const kind = importType === 'customer_opening_receivables' ? 'receivable' : 'advance';
    return deps.customersService.postOpeningBalance(
      organizationId,
      customer.id,
      { kind, amount: { amount: values.amount, currency: 'PKR' } },
      actor,
      null,
      { session },
    );
  }
  if (importType === 'supplier_opening_payables' || importType === 'supplier_opening_advances') {
    const supplier = await deps.suppliersService.findSupplierByName(organizationId, values.supplierName);
    const kind = importType === 'supplier_opening_payables' ? 'payable' : 'advance';
    return deps.suppliersService.postOpeningBalance(
      organizationId,
      supplier.id,
      { kind, amount: { amount: values.amount, currency: 'PKR' } },
      actor,
      null,
      { session },
    );
  }
  if (ACCOUNT_TYPE_BY_IMPORT[importType]) {
    const account = await deps.accountsService.findAccountByName(organizationId, values.accountName);
    return deps.accountsService.postOpeningBalance(
      organizationId,
      account.id,
      { amount: { amount: values.amount, currency: 'PKR' } },
      actor,
      null,
      { session },
    );
  }
  if (importType === 'opening_stock') {
    const product = await deps.catalogService.findProductBySku(organizationId, values.productSku);
    const warehouses = (await deps.locationsService.listWarehouses(organizationId)).items;
    const warehouse = warehouses.find(
      (item) =>
        String(item.code ?? '').toLowerCase() === String(values.warehouseCode).toLowerCase() ||
        String(item.name ?? '').toLowerCase() === String(values.warehouseCode).toLowerCase(),
    );
    const body = {
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: values.quantity,
      inventoryValue: { amount: values.inventoryValue, currency: 'PKR' },
    };
    if (values.batchNumber) body.batchNumber = values.batchNumber;
    if (values.expiryDate) body.expiryDate = values.expiryDate;
    if (values.manufacturingDate) body.manufacturingDate = values.manufacturingDate;
    return deps.inventoryService.postOpeningStock(organizationId, body, actor, null, {
      session,
      authContext: actor.authContext,
    });
  }
  throw validationFailed('Unsupported import type');
}

function createImportsService(deps) {
  const store = deps.store;
  const transactionRunner = deps.transactionRunner;
  const idempotency = deps.idempotency;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: async (session, event) => {
      await store.appendAuditEvent(session, event);
      if (deps.auditStore) {
        await deps.auditStore.append(session, event);
      }
    },
  });

  async function assertImportsEntitlement(organizationId) {
    const entitlements =
      typeof deps.resolvePlanEntitlements === 'function'
        ? await deps.resolvePlanEntitlements(organizationId)
        : null;
    const feature = evaluateFeatureEntitlement(entitlements ? { entitlements } : null, 'imports');
    if (feature.allowed !== true) {
      throw forbidden('Imports are not entitled for this subscription');
    }
  }

  async function requireJob(organizationId, jobId) {
    const job = await store.findJobById(organizationId, jobId);
    if (job === null) {
      throw notFound('Import job not found');
    }
    return job;
  }

  return {
    listTemplates() {
      return { items: listTemplates() };
    },

    downloadTemplate(importType) {
      const template = getTemplate(importType);
      if (template === null) {
        throw validationFailed('Unknown import type', [
          { field: 'importType', message: 'Unknown import type' },
        ]);
      }
      return {
        filename: `${importType}-v${template.version}.xls`,
        contentType: 'application/vnd.ms-excel',
        buffer: renderImportWorkbook(importType, []),
        template,
      };
    },

    async createJob(organizationId, body, actor) {
      await assertImportsEntitlement(organizationId);
      const importType = body?.importType;
      if (!IMPORT_TYPES.includes(importType)) {
        throw validationFailed('importType is invalid', [
          { field: 'importType', message: 'importType is not a Frozen Release 1 import' },
        ]);
      }
      const template = getTemplate(importType);
      const created = await store.insertJob(null, {
        organizationId,
        importType,
        templateVersion: template.version,
        status: 'created',
        version: 1,
      });
      await auditWriter.appendBusinessEvent(null, {
        organizationId,
        actorId: actor.actorId,
        action: 'import_job.created',
        resourceType: 'import_job',
        resourceId: String(created['_id']),
        metadata: { importType },
      });
      return toJobDto(created, { createUpdatePolicy: template.createUpdatePolicy });
    },

    async uploadWorkbook(organizationId, jobId, file, actor) {
      await assertImportsEntitlement(organizationId);
      const job = await requireJob(organizationId, jobId);
      if (job.status !== 'created' && job.status !== 'uploaded' && job.status !== 'previewed') {
        throw conflict('Workbook cannot be replaced after confirmation');
      }
      if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
        throw validationFailed('Workbook file is required', [
          { field: 'file', message: 'Workbook file is required' },
        ]);
      }
      if (file.buffer.length > 5 * 1024 * 1024) {
        throw validationFailed('Workbook exceeds 5MB', [{ field: 'file', message: 'Workbook exceeds 5MB' }]);
      }
      const storageRef = `local://${organizationId}/${String(job['_id'])}`;
      await store.writeWorkbook(storageRef, file.buffer);
      const updated = await store.updateJob(null, organizationId, jobId, {
        status: 'uploaded',
        storageRef,
        originalFileName: file.originalFileName ?? 'import.xls',
        contentType: file.contentType ?? 'application/vnd.ms-excel',
        size: file.buffer.length,
        checksum: checksumOf(file.buffer),
        uploadedAt: now(),
        uploadedBy: actor.actorId,
        preview: null,
        failureMessage: '',
        version: Number(job.version ?? 1) + 1,
      });
      await store.replaceErrors(null, organizationId, jobId, []);
      return toJobDto(updated);
    },

    async validateJob(organizationId, jobId, authContext) {
      await assertImportsEntitlement(organizationId);
      const job = await requireJob(organizationId, jobId);
      if (!job.storageRef) {
        throw validationFailed('Upload a workbook before validation');
      }
      const buffer = await store.readWorkbook(job.storageRef);
      let parsed;
      try {
        parsed = parseImportWorkbook(buffer, job.importType);
      } catch (error) {
        if (error?.details) {
          await store.replaceErrors(
            null,
            organizationId,
            jobId,
            error.details.map((detail) => ({
              rowNumber: Number(detail.row ?? 1),
              field: detail.field,
              code: detail.code ?? 'TEMPLATE_INVALID',
              message: detail.message,
            })),
          );
          const updated = await store.updateJob(null, organizationId, jobId, {
            status: 'previewed',
            preview: {
              templateType: job.importType,
              templateVersion: job.templateVersion,
              createUpdatePolicy: getTemplate(job.importType).createUpdatePolicy,
              totalRows: 0,
              validRows: 0,
              invalidRows: error.details.length,
            },
            version: Number(job.version ?? 1) + 1,
          });
          return toJobDto(updated, {
            errors: error.details.map((detail) => ({
              row: Number(detail.row ?? 1),
              field: detail.field,
              code: detail.code,
              message: detail.message,
            })),
          });
        }
        throw error;
      }

      const headerErrors = parsed.headerErrors.map((error) => ({
        rowNumber: error.row,
        field: error.field,
        code: error.code,
        message: error.message,
      }));
      const previewed = await previewRows(
        job.importType,
        parsed.records,
        deps,
        organizationId,
        authContext,
      );
      const errors = [...headerErrors, ...previewed.errors];
      const invalidRowNumbers = new Set(errors.map((error) => error.rowNumber).filter((row) => row > 2));
      const invalidRows = parsed.headerErrors.length > 0 ? parsed.records.length : invalidRowNumbers.size;
      const validRows = parsed.headerErrors.length > 0 ? 0 : parsed.records.length - invalidRows;
      await store.replaceErrors(null, organizationId, jobId, errors);
      const updated = await store.updateJob(null, organizationId, jobId, {
        status: 'previewed',
        preview: {
          templateType: parsed.templateType,
          templateVersion: parsed.templateVersion,
          createUpdatePolicy: parsed.createUpdatePolicy,
          totalRows: parsed.records.length,
          validRows,
          invalidRows,
          intended: previewed.intended,
        },
        version: Number(job.version ?? 1) + 1,
      });
      return toJobDto(updated, { errors: errors.map(toErrorDto) });
    },

    async getJob(organizationId, jobId) {
      await assertImportsEntitlement(organizationId);
      const job = await requireJob(organizationId, jobId);
      const errors = await store.listErrors(organizationId, jobId);
      return toJobDto(job, { errors: errors.map(toErrorDto) });
    },

    async listErrors(organizationId, jobId) {
      await assertImportsEntitlement(organizationId);
      await requireJob(organizationId, jobId);
      const errors = await store.listErrors(organizationId, jobId);
      return { items: errors.map(toErrorDto) };
    },

    async confirmJob(organizationId, jobId, actor) {
      await assertImportsEntitlement(organizationId);
      const job = await requireJob(organizationId, jobId);
      if (job.status !== 'previewed' && job.status !== 'failed') {
        throw conflict('Import must be previewed before confirm');
      }
      const invalidRows = Number(job.preview?.invalidRows ?? 0);
      if (invalidRows > 0) {
        throw validationFailed('Import cannot be confirmed while rows are invalid', [
          { field: 'preview', message: 'All rows must be valid before execute' },
        ]);
      }
      if (Number(job.preview?.totalRows ?? 0) < 1) {
        throw validationFailed('Import has no data rows');
      }
      const updated = await store.updateJob(null, organizationId, jobId, {
        status: 'confirmed',
        confirmedAt: now(),
        confirmedBy: actor.actorId,
        version: Number(job.version ?? 1) + 1,
      });
      return toJobDto(updated);
    },

    async executeJob(organizationId, jobId, actor, idempotencyKey, options = {}) {
      await assertImportsEntitlement(organizationId);
      const key = requireIdempotencyKey(idempotencyKey);
      let result;
      try {
        result = await idempotency.execute(
        {
          scopeType: 'organization',
          organizationId,
          actorId: actor.actorId,
          operation: 'imports.execute',
        },
        key,
        { jobId },
        async () => {
          const claimed = await store.claimExecute(organizationId, jobId);
          if (claimed === null) {
            const current = await requireJob(organizationId, jobId);
            if (current.status === 'completed') {
              throw conflict('Import job already completed');
            }
            if (current.status === 'executing') {
              throw conflict('Import job is already executing');
            }
            throw conflict('Import job must be confirmed before execute');
          }

          try {
            const buffer = await store.readWorkbook(claimed.storageRef);
            const parsed = parseImportWorkbook(buffer, claimed.importType);
            const previewed = await previewRows(
              claimed.importType,
              parsed.records,
              deps,
              organizationId,
              actor.authContext,
            );
            const errors = [
              ...parsed.headerErrors.map((error) => ({
                rowNumber: error.row,
                field: error.field,
                code: error.code,
                message: error.message,
              })),
              ...previewed.errors,
            ];
            if (errors.length > 0) {
              throw validationFailed('Import cannot execute while rows are invalid', errors);
            }

            const references = [];
            await transactionRunner.run(async (session) => {
              let index = 0;
              for (const row of parsed.records) {
                if (typeof options.failAfterRow === 'number' && index >= options.failAfterRow) {
                  throw new Error('Forced import execution failure');
                }
                const created = await executeRow(
                  claimed.importType,
                  row,
                  deps,
                  organizationId,
                  actor,
                  session,
                );
                const createdId =
                  created?.id ??
                  created?.data?.id ??
                  created?.data?.movement?.id ??
                  created?.movement?.id ??
                  null;
                references.push({
                  rowNumber: row.rowNumber,
                  resourceId: createdId ? String(createdId) : null,
                });
                index += 1;
              }

              await auditWriter.appendBusinessEvent(session, {
                organizationId,
                actorId: actor.actorId,
                action: 'import_job.executed',
                resourceType: 'import_job',
                resourceId: jobId,
                metadata: {
                  importType: claimed.importType,
                  createdCount: references.length,
                },
              });
              return { createdCount: references.length };
            });

            const completed = await store.updateJob(null, organizationId, jobId, {
              status: 'completed',
              executedAt: now(),
              executedBy: actor.actorId,
              result: {
                createdCount: references.length,
                references,
              },
              failureMessage: '',
              version: Number(claimed.version ?? 1) + 1,
            });
            return { statusCode: 200, body: toJobDto(completed) };
          } catch (error) {
            await store.updateJob(null, organizationId, jobId, {
              status: 'failed',
              failureMessage: error.message || 'Import execution failed',
              executedAt: now(),
              executedBy: actor.actorId,
              version: Number(claimed.version ?? 1) + 1,
            });
            throw error;
          }
        },
      );
      } catch (error) {
        if (error?.name === 'IdempotencyInProgressError') {
          throw conflict('Import execute is already in progress');
        }
        if (error?.name === 'IdempotencyConflictError') {
          throw conflict(error.message);
        }
        throw error;
      }

      return {
        replay: result.replay,
        data: result.response.body,
        statusCode: result.response.statusCode,
      };
    },
  };
}

function createImportsModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseImportsStore() : createInMemoryImportsStore());
  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);
  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const idempotencyStore =
    options.idempotencyStore ??
    (persistence === 'mongoose'
      ? createMongooseIdempotencyStore()
      : createInMemoryIdempotencyStore());
  const idempotency = options.idempotency ?? createIdempotencyService(idempotencyStore);

  const importsService = createImportsService({
    store,
    transactionRunner,
    idempotency,
    catalogService: options.catalogService,
    customersService: options.customersService,
    suppliersService: options.suppliersService,
    accountsService: options.accountsService,
    inventoryService: options.inventoryService,
    locationsService: options.locationsService,
    canAccessWarehouse: options.canAccessWarehouse,
    resolvePlanEntitlements: options.resolvePlanEntitlements,
    ...(options.auditStore === undefined ? {} : { auditStore: options.auditStore }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, importsService };
}

module.exports = {
  createImportsModule,
  createImportsService,
  createInMemoryImportsStore,
  createMongooseImportsStore,
  randomUUID,
};
