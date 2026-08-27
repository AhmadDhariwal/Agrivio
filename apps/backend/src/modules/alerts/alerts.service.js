const { notFound, validationFailed } = require('../../platform/errors/app-error');
const {
  formatMoneyMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const { resolveBusinessDate } = require('../inventory/public');
const {
  ALERT_CAPABILITY_KEY_BY_ALERT_TYPE,
} = require('../capabilities/capability.registry');
const {
  formatQty,
  inactivityWindowStart,
  isDeadStock,
  isLowStock,
  sumSellableByProduct,
  sumSellableByProductWarehouse,
} = require('./alert-calculations');

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function resolveTargetRoute(alertType) {
  switch (alertType) {
    case 'upcoming_expiry':
    case 'expired_stock':
      return '/app/inventory/expiry';
    case 'low_stock':
    case 'dead_stock':
      return '/app/inventory/stock';
    case 'customer_dues':
      return '/app/customers';
    case 'supplier_dues':
      return '/app/suppliers';
    default:
      return '/app/alerts';
  }
}

function toNotificationDto(record, isRead = false) {
  const alertType = String(record.alertType);
  const toIso = (value) => {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : String(value);
  };
  return {
    id: String(record['_id'] ?? record.id),
    alertType,
    title: String(record.title),
    body: String(record.body),
    subjectKey: String(record.subjectKey),
    fingerprint: String(record.fingerprint),
    targetRoute: resolveTargetRoute(alertType),
    isRead: Boolean(isRead),
    active: record.active !== false,
    activatedAt: toIso(record.activatedAt ?? record.createdAt),
    resolvedAt: toIso(record.resolvedAt),
    acknowledgedAt: toIso(record.acknowledgedAt),
    acknowledgedBy: record.acknowledgedBy ? String(record.acknowledgedBy) : null,
    createdAt: toIso(record.createdAt),
  };
}

function createAlertsService(deps) {
  const store = deps.store;
  const inventoryService = deps.inventoryService;
  const paymentsService = deps.paymentsService;
  const salesService = deps.salesService;
  const resolveOrganizationTimezone = deps.resolveOrganizationTimezone;
  const now = deps.now ?? (() => new Date());

  async function resolveCapabilityProjection(organizationId, authContext, enforceCapabilities) {
    const enabledAlertTypes = new Set(Object.keys(ALERT_CAPABILITY_KEY_BY_ALERT_TYPE));
    if (!enforceCapabilities || typeof deps.capabilityService?.resolveEffective !== 'function') {
      return { enabledAlertTypes, summaryCardsEnabled: true };
    }

    const effective = await deps.capabilityService.resolveEffective(organizationId, {
      permissions: authContext?.permissions ?? [],
    });
    const controls = new Map(effective.controls.map((control) => [control.key, control]));
    for (const [alertType, controlKey] of Object.entries(
      ALERT_CAPABILITY_KEY_BY_ALERT_TYPE,
    )) {
      if (controls.get(controlKey)?.effectiveValue?.enabled !== true) {
        enabledAlertTypes.delete(alertType);
      }
    }
    return {
      enabledAlertTypes,
      summaryCardsEnabled:
        controls.get('alerts.features.summaryCards')?.effectiveValue?.enabled === true,
    };
  }

  function applyCapabilityProjection(alerts, projection) {
    const family = (value, alertType) => {
      if (projection.enabledAlertTypes.has(alertType)) {
        return { ...value, items: [...(value.items ?? [])] };
      }
      return {
        ...value,
        items: [],
        count: 0,
        ...(value.total === undefined ? {} : { total: toMoneyDto(0n) }),
      };
    };
    const lowStock = family(alerts.lowStock, 'low_stock');
    const upcomingExpiry = family(alerts.upcomingExpiry, 'upcoming_expiry');
    const expiredStock = family(alerts.expiredStock, 'expired_stock');
    const deadStock = family(alerts.deadStock, 'dead_stock');
    const customerDues = family(alerts.customerDues, 'customer_dues');
    const supplierDues = family(alerts.supplierDues, 'supplier_dues');
    const summaries = {
      lowStockCount: lowStock.count,
      upcomingExpiryCount: upcomingExpiry.count,
      expiredStockCount: expiredStock.count,
      deadStockCount: deadStock.count,
      customerDuesCount: customerDues.count,
      supplierDuesCount: supplierDues.count,
      customerDuesAmount: customerDues.total,
      supplierDuesAmount: supplierDues.total,
    };
    return {
      ...alerts,
      summaries: projection.summaryCardsEnabled ? summaries : null,
      lowStock,
      upcomingExpiry,
      expiredStock,
      deadStock,
      customerDues,
      supplierDues,
      items: alerts.items.filter((item) => projection.enabledAlertTypes.has(item.alertType)),
    };
  }

  function isActiveAllowedNotification(record, projection) {
    return record.active !== false && projection.enabledAlertTypes.has(String(record.alertType));
  }

  async function resolveOrgBusinessDate(organizationId) {
    const timezone = await resolveOrganizationTimezone(organizationId);
    return resolveBusinessDate(timezone, now());
  }

  async function queryLowStock(organizationId, authContext) {
    const thresholds = await store.listLowStockThresholds(organizationId);
    if (thresholds.length === 0) {
      return { items: [], count: 0 };
    }
    const balances = await inventoryService.listBalances(organizationId, {}, authContext);
    const sellable = sumSellableByProductWarehouse(balances.items ?? []);
    const items = [];
    for (const threshold of thresholds) {
      const productId = String(threshold.productId);
      const warehouseId = String(threshold.warehouseId);
      if (
        typeof deps.canAccessWarehouse === 'function' &&
        !deps.canAccessWarehouse(authContext, warehouseId)
      ) {
        continue;
      }
      const key = `${productId}::${warehouseId}`;
      const sellableQty = sellable.get(key) ?? 0n;
      const thresholdQty = BigInt(String(threshold.thresholdQuantityBaseMinorUnits));
      if (
        !isLowStock({
          sellableQuantityBaseMinorUnits: sellableQty.toString(),
          thresholdQuantityBaseMinorUnits: thresholdQty.toString(),
        })
      ) {
        continue;
      }
      items.push({
        alertType: 'low_stock',
        productId,
        warehouseId,
        sellableQuantityBase: formatQty(sellableQty),
        thresholdQuantityBase: formatQty(thresholdQty),
        fingerprint: `low_stock:${productId}:${warehouseId}`,
        title: 'Low stock',
        body: `Sellable quantity ${formatQty(sellableQty)} is at or below threshold ${formatQty(thresholdQty)}.`,
        subjectKey: key,
      });
    }
    return { items, count: items.length };
  }

  async function queryExpiryAlerts(organizationId, authContext) {
    const expiry = await inventoryService.queryExpiry(organizationId, {}, authContext);
    const upcoming = [];
    const expired = [];
    for (const item of expiry.items ?? []) {
      if (item.classification === 'upcoming') {
        upcoming.push({
          alertType: 'upcoming_expiry',
          productId: item.productId,
          warehouseId: item.warehouseId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantityBase: item.quantityBase,
          fingerprint: `upcoming_expiry:${item.batchId ?? item.productId}:${item.warehouseId}`,
          title: 'Upcoming expiry',
          body: `Batch ${item.batchNumber ?? item.batchId} expires on ${item.expiryDate}.`,
          subjectKey: String(item.batchId ?? `${item.productId}:${item.warehouseId}`),
        });
      } else if (item.classification === 'expired') {
        expired.push({
          alertType: 'expired_stock',
          productId: item.productId,
          warehouseId: item.warehouseId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantityBase: item.quantityBase,
          fingerprint: `expired_stock:${item.batchId ?? item.productId}:${item.warehouseId}`,
          title: 'Expired stock',
          body: `Batch ${item.batchNumber ?? item.batchId} expired on ${item.expiryDate}.`,
          subjectKey: String(item.batchId ?? `${item.productId}:${item.warehouseId}`),
        });
      }
    }
    return {
      businessDate: expiry.businessDate,
      thresholdDays: expiry.thresholdDays,
      upcoming: { items: upcoming, count: upcoming.length },
      expired: { items: expired, count: expired.length },
    };
  }

  async function queryDeadStock(organizationId, authContext, businessDate) {
    const settings = await store.findAlertSettings(organizationId);
    if (settings === null || settings.deadStockInactivityDays === undefined) {
      return {
        items: [],
        count: 0,
        configured: false,
        deadStockInactivityDays: null,
        businessDate,
        inactivityFromDate: null,
      };
    }
    const inactivityDays = Number(settings.deadStockInactivityDays);
    if (!Number.isInteger(inactivityDays) || inactivityDays < 1) {
      throw validationFailed('deadStockInactivityDays must be a positive integer', [
        { field: 'deadStockInactivityDays', message: 'must be a positive integer' },
      ]);
    }

    const fromSaleDate = inactivityWindowStart(businessDate, inactivityDays);
    const activity = await salesService.listPostedSaleProductActivity(
      organizationId,
      { fromSaleDate, toSaleDate: businessDate },
      authContext,
    );
    const activeProducts = new Set(activity.productIds ?? []);
    const balances = await inventoryService.listBalances(organizationId, {}, authContext);
    const sellableByProduct = sumSellableByProduct(balances.items ?? []);
    const items = [];
    for (const [productId, sellableQty] of sellableByProduct.entries()) {
      if (
        !isDeadStock({
          sellableQuantityBaseMinorUnits: sellableQty.toString(),
          hadSaleInInactivityPeriod: activeProducts.has(productId),
        })
      ) {
        continue;
      }
      items.push({
        alertType: 'dead_stock',
        productId,
        sellableQuantityBase: formatQty(sellableQty),
        inactivityDays,
        inactivityFromDate: fromSaleDate,
        businessDate,
        fingerprint: `dead_stock:${productId}`,
        title: 'Dead stock',
        body: `Product has sellable stock with no posted sale since ${fromSaleDate}.`,
        subjectKey: productId,
      });
    }
    return {
      items,
      count: items.length,
      configured: true,
      deadStockInactivityDays: inactivityDays,
      businessDate,
      inactivityFromDate: fromSaleDate,
    };
  }

  async function queryCustomerDues(organizationId) {
    const { items } = await paymentsService.listCustomerReceivableBalances(organizationId);
    const mapped = items.map((item) => ({
      alertType: 'customer_dues',
      customerId: item.customerId,
      receivable: item.receivable,
      fingerprint: `customer_dues:${item.customerId}`,
      title: 'Customer dues',
      body: `Customer receivable balance ${item.receivable.amount} ${item.receivable.currency}.`,
      subjectKey: item.customerId,
    }));
    const totalMinorUnits = items.reduce(
      (total, item) => total + BigInt(String(item.receivableMinorUnits ?? '0')),
      0n,
    );
    return { items: mapped, count: mapped.length, total: toMoneyDto(totalMinorUnits) };
  }

  async function querySupplierDues(organizationId) {
    const { items } = await paymentsService.listSupplierPayableBalances(organizationId);
    const mapped = items.map((item) => ({
      alertType: 'supplier_dues',
      supplierId: item.supplierId,
      payable: item.payable,
      fingerprint: `supplier_dues:${item.supplierId}`,
      title: 'Supplier dues',
      body: `Supplier payable balance ${item.payable.amount} ${item.payable.currency}.`,
      subjectKey: item.supplierId,
    }));
    const totalMinorUnits = items.reduce(
      (total, item) => total + BigInt(String(item.payableMinorUnits ?? '0')),
      0n,
    );
    return { items: mapped, count: mapped.length, total: toMoneyDto(totalMinorUnits) };
  }

  async function queryAlerts(organizationId, authContext) {
    const businessDate = await resolveOrgBusinessDate(organizationId);
    const [lowStock, expiry, customerDues, supplierDues] = await Promise.all([
      queryLowStock(organizationId, authContext),
      queryExpiryAlerts(organizationId, authContext),
      queryCustomerDues(organizationId),
      querySupplierDues(organizationId),
    ]);
    const deadStock = await queryDeadStock(
      organizationId,
      authContext,
      expiry.businessDate ?? businessDate,
    );

    const items = [
      ...lowStock.items,
      ...expiry.upcoming.items,
      ...expiry.expired.items,
      ...deadStock.items,
      ...customerDues.items,
      ...supplierDues.items,
    ];

    return {
      businessDate: expiry.businessDate ?? businessDate,
      expiryThresholdDays: expiry.thresholdDays,
      deadStockInactivityDays: deadStock.deadStockInactivityDays,
      summaries: {
        lowStockCount: lowStock.count,
        upcomingExpiryCount: expiry.upcoming.count,
        expiredStockCount: expiry.expired.count,
        deadStockCount: deadStock.count,
        customerDuesCount: customerDues.count,
        supplierDuesCount: supplierDues.count,
        customerDuesAmount: customerDues.total,
        supplierDuesAmount: supplierDues.total,
      },
      lowStock,
      upcomingExpiry: expiry.upcoming,
      expiredStock: expiry.expired,
      deadStock,
      customerDues,
      supplierDues,
      items,
    };
  }

  async function syncNotifications(organizationId, authContext, options = {}) {
    const alerts = await queryAlerts(organizationId, authContext);
    const observedAt = now();
    const records = [];
    for (const alert of alerts.items) {
      const record = await store.upsertNotificationItem(organizationId, {
        fingerprint: alert.fingerprint,
        alertType: alert.alertType,
        title: alert.title,
        body: alert.body,
        subjectKey: alert.subjectKey,
        observedAt,
      });
      records.push(record);
    }
    const unrestrictedWarehouseScope =
      authContext?.role === 'Owner' ||
      (authContext?.warehouseAssignments === undefined &&
        authContext?.allowedWarehouses === undefined);
    if (unrestrictedWarehouseScope) {
      await store.resolveMissingNotifications(
        organizationId,
        alerts.items.map((alert) => alert.fingerprint),
        observedAt,
      );
    }

    const projection = await resolveCapabilityProjection(
      organizationId,
      authContext,
      options.enforceCapabilities === true,
    );
    const projectedAlerts = applyCapabilityProjection(alerts, projection);
    records.sort((a, b) =>
      String(b.activatedAt ?? b.createdAt ?? '').localeCompare(
        String(a.activatedAt ?? a.createdAt ?? ''),
      ),
    );
    const projectedRecords = records.filter((record) =>
      isActiveAllowedNotification(record, projection),
    );
    const userId = authContext?.userId;
    const readIds = userId
      ? await store.listReadNotificationIds(organizationId, userId)
      : [];
    const readSet = new Set(readIds);
    const items = projectedRecords.map((record) =>
      toNotificationDto(record, readSet.has(String(record['_id'] ?? record.id))),
    );
    return {
      alerts: projectedAlerts,
      items,
      unreadCount: items.filter((item) => !item.isRead).length,
    };
  }

  return {
    async upsertDeadStockInactivityDays(organizationId, days) {
      const parsed = Number(days);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw validationFailed('deadStockInactivityDays must be a positive integer', [
          { field: 'deadStockInactivityDays', message: 'must be a positive integer' },
        ]);
      }
      const record = await store.upsertAlertSettings(organizationId, {
        deadStockInactivityDays: parsed,
      });
      return {
        deadStockInactivityDays: Number(record.deadStockInactivityDays),
        version: Number(record.version),
      };
    },

    async upsertLowStockThreshold(organizationId, input) {
      if (typeof input?.productId !== 'string' || input.productId.trim() === '') {
        throw validationFailed('productId is required', [
          { field: 'productId', message: 'productId is required' },
        ]);
      }
      if (typeof input?.warehouseId !== 'string' || input.warehouseId.trim() === '') {
        throw validationFailed('warehouseId is required', [
          { field: 'warehouseId', message: 'warehouseId is required' },
        ]);
      }
      let thresholdMinor;
      try {
        thresholdMinor = parseQuantityMinorUnits(String(input.thresholdQuantityBase));
      } catch {
        throw validationFailed('thresholdQuantityBase is invalid', [
          { field: 'thresholdQuantityBase', message: 'must be a decimal quantity string' },
        ]);
      }
      if (thresholdMinor < 0n) {
        throw validationFailed('thresholdQuantityBase must be non-negative', [
          { field: 'thresholdQuantityBase', message: 'must be non-negative' },
        ]);
      }
      const record = await store.upsertLowStockThreshold(organizationId, {
        productId: input.productId.trim(),
        warehouseId: input.warehouseId.trim(),
        thresholdQuantityBaseMinorUnits: thresholdMinor.toString(),
      });
      return {
        productId: String(record.productId),
        warehouseId: String(record.warehouseId),
        thresholdQuantityBase: formatQty(record.thresholdQuantityBaseMinorUnits),
      };
    },

    async listAlerts(organizationId, authContext, options = {}) {
      const alerts = await queryAlerts(organizationId, authContext);
      if (options.enforceCapabilities !== true) {
        return alerts;
      }
      const projection = await resolveCapabilityProjection(organizationId, authContext, true);
      return applyCapabilityProjection(alerts, projection);
    },

    async getNotificationFeed(organizationId, authContext, limit = 6, options = {}) {
      const synced = await syncNotifications(organizationId, authContext, options);
      const boundedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(50, limit)) : 6;
      return {
        items: synced.items.slice(0, boundedLimit),
        unreadCount: synced.unreadCount,
      };
    },

    async listNotifications(organizationId, authContext, options = {}) {
      const { alerts, items, unreadCount } = await syncNotifications(
        organizationId,
        authContext,
        options,
      );

      return {
        items,
        summaries: alerts.summaries,
        unreadCount,
        businessDate: alerts.businessDate,
      };
    },

    async markNotificationRead(organizationId, userId, notificationId, authContext, options = {}) {
      const synced = await syncNotifications(organizationId, authContext, options);
      if (!synced.items.some((item) => item.id === String(notificationId))) {
        throw notFound('Notification not found');
      }
      const readAt = now();
      const updated = await store.markNotificationRead(
        organizationId,
        userId,
        notificationId,
        readAt,
      );
      if (updated === null) {
        throw notFound('Notification not found');
      }
      const readIds = new Set(await store.listReadNotificationIds(organizationId, userId));
      const unreadCount = synced.items.filter((item) => !readIds.has(item.id)).length;
      return { id: String(notificationId), isRead: true, unreadCount };
    },

    async markAllNotificationsRead(organizationId, userId, authContext, options = {}) {
      const synced = await syncNotifications(organizationId, authContext, options);
      const ids = synced.items.map((item) => item.id);
      await store.markAllNotificationsRead(organizationId, userId, ids, now());
      return { success: true, unreadCount: 0 };
    },

    async acknowledgeNotification(
      organizationId,
      notificationId,
      actorId,
      authContext,
      options = {},
    ) {
      const synced = await syncNotifications(organizationId, authContext, options);
      if (!synced.items.some((item) => item.id === String(notificationId))) {
        throw notFound('Notification not found');
      }
      const updated = await store.acknowledgeNotification(
        organizationId,
        notificationId,
        actorId,
        now(),
      );
      if (updated === null) {
        throw notFound('Notification not found');
      }
      const readIds = await store.listReadNotificationIds(organizationId, actorId);
      return toNotificationDto(
        updated,
        readIds.includes(String(updated['_id'] ?? updated.id)),
      );
    },

    async getAlertSummaries(organizationId, authContext) {
      const alerts = await this.listAlerts(organizationId, authContext);
      return {
        businessDate: alerts.businessDate,
        lowStockCount: alerts.summaries.lowStockCount,
        upcomingExpiryCount: alerts.summaries.upcomingExpiryCount,
        expiredStockCount: alerts.summaries.expiredStockCount,
        deadStock: {
          count: alerts.summaries.deadStockCount,
          inactivityDays: alerts.deadStockInactivityDays,
          items: alerts.deadStock.items.map((item) => ({
            productId: item.productId,
            sellableQuantityBase: item.sellableQuantityBase,
          })),
        },
      };
    },

    mutateInventory() {
      throw validationFailed('Alerts cannot mutate inventory');
    },
    mutateLedgers() {
      throw validationFailed('Alerts cannot mutate ledgers');
    },
  };
}

module.exports = {
  createAlertsService,
  toMoneyDto,
};
