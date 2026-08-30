import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilitiesApi } from './capabilities.api';
import { CapabilityService } from './capability.service';
import {
  REPORT_CAPABILITY_KEY_BY_REPORT_KEY,
  REPORT_EXPORT_ACTION_BY_FORMAT,
} from '../../reports/models/reports.models';
import { appRoutes } from '../../../app.routes';
import { CANONICAL_NAVIGATION } from '../../shell/data-access/navigation.model';

describe('CapabilityService', () => {
  it('refreshes effective organization capabilities without a new session', () => {
    let cardsEnabled = true;
    const api = {
      getCurrent: () =>
        of({
          organizationId: 'org-1',
          version: cardsEnabled ? 1 : 2,
          controls: [
            {
              key: 'inventory.products.views.desktopCards',
              type: 'VIEW' as const,
              value: { enabled: cardsEnabled },
              reasons: [],
            },
          ],
        }),
    };
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        { provide: CapabilitiesApi, useValue: api },
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    service.refresh().subscribe();
    expect(service.canUseView('inventory.products.views.desktopCards')).toBe(true);
    expect(service.version()).toBe(1);

    cardsEnabled = false;
    service.refresh().subscribe();
    expect(service.canUseView('inventory.products.views.desktopCards')).toBe(false);
    expect(service.version()).toBe(2);
  });

  it('provides default enabled/visible/allowed values for all 20 inventory.adjustments.* controls', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module
    expect(service.canUseModule('inventory.adjustments')).toBe(true);

    // 7 Features
    expect(service.canUseView('inventory.adjustments.features.moduleInfo')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.productSearch')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.productContext')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.stockContext')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.guidance')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.recentAdjustments')).toBe(true);
    expect(service.canUseView('inventory.adjustments.features.serverPostingDate')).toBe(true);

    // 8 Fields
    expect(service.canViewField('inventory.adjustments.fields.warehouse')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.product')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.adjustmentType')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.quantity')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.reason')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.batch')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.direction')).toBe(true);
    expect(service.canViewField('inventory.adjustments.fields.inventoryValue')).toBe(true);

    // 4 Actions
    expect(service.canPerformAction('inventory.adjustments.actions.post')).toBe(true);
    expect(service.canPerformAction('inventory.adjustments.actions.reverse')).toBe(true);
    expect(service.canPerformAction('inventory.adjustments.actions.viewStock')).toBe(true);
    expect(service.canPerformAction('inventory.adjustments.actions.viewMovements')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 18 inventory.transfers.* controls', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module
    expect(service.canUseModule('inventory.transfers')).toBe(true);

    // 7 Features
    expect(service.canUseView('inventory.transfers.features.moduleInfo')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.productSearch')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.productContext')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.stockContext')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.guidance')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.recentTransfers')).toBe(true);
    expect(service.canUseView('inventory.transfers.features.serverTransferDate')).toBe(true);

    // 6 Fields
    expect(service.canViewField('inventory.transfers.fields.sourceWarehouse')).toBe(true);
    expect(service.canViewField('inventory.transfers.fields.destinationWarehouse')).toBe(true);
    expect(service.canViewField('inventory.transfers.fields.product')).toBe(true);
    expect(service.canViewField('inventory.transfers.fields.quantity')).toBe(true);
    expect(service.canViewField('inventory.transfers.fields.reason')).toBe(true);
    expect(service.canViewField('inventory.transfers.fields.batch')).toBe(true);

    // 4 Actions
    expect(service.canPerformAction('inventory.transfers.actions.post')).toBe(true);
    expect(service.canPerformAction('inventory.transfers.actions.reverse')).toBe(true);
    expect(service.canPerformAction('inventory.transfers.actions.inspect')).toBe(true);
    expect(service.canPerformAction('inventory.transfers.actions.viewStock')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 20 inventory.reconciliation.* controls', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module
    expect(service.canUseModule('inventory.reconciliation')).toBe(true);

    // 7 Features
    expect(service.canUseView('inventory.reconciliation.features.moduleInfo')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.search')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.warehouseFilter')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.findingFilter')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.kpiCards')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.inspector')).toBe(true);
    expect(service.canUseView('inventory.reconciliation.features.technicalDetails')).toBe(true);

    // 7 Fields
    expect(service.canViewField('inventory.reconciliation.fields.product')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.warehouse')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.batch')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.balanceQuantity')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.movementQuantity')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.variance')).toBe(true);
    expect(service.canViewField('inventory.reconciliation.fields.findingCode')).toBe(true);

    // 5 Actions
    expect(service.canPerformAction('inventory.reconciliation.actions.refresh')).toBe(true);
    expect(service.canPerformAction('inventory.reconciliation.actions.inspect')).toBe(true);
    expect(service.canPerformAction('inventory.reconciliation.actions.viewStock')).toBe(true);
    expect(service.canPerformAction('inventory.reconciliation.actions.viewMovements')).toBe(true);
    expect(service.canPerformAction('inventory.reconciliation.actions.viewBatch')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 21 inventory.movements.* controls matching backend registry', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module (1)
    expect(service.canUseModule('inventory.movements')).toBe(true);

    // 8 Features
    expect(service.canUseView('inventory.movements.features.moduleInfo')).toBe(true);
    expect(service.canUseView('inventory.movements.features.search')).toBe(true);
    expect(service.canUseView('inventory.movements.features.filters')).toBe(true);
    expect(service.canUseView('inventory.movements.features.kpiCards')).toBe(true);
    expect(service.canUseView('inventory.movements.features.referenceResolution')).toBe(true);
    expect(service.canUseView('inventory.movements.features.inspector')).toBe(true);
    expect(service.canUseView('inventory.movements.features.technicalDetails')).toBe(true);
    expect(service.canUseView('inventory.movements.features.mobileCards')).toBe(true);

    // 7 Fields (Platform enforced)
    expect(service.canViewField('inventory.movements.fields.product')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.warehouse')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.direction')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.quantity')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.sourceType')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.batch')).toBe(true);
    expect(service.canViewField('inventory.movements.fields.inventoryValue')).toBe(true);

    // 5 Actions
    expect(service.canPerformAction('inventory.movements.actions.refresh')).toBe(true);
    expect(service.canPerformAction('inventory.movements.actions.inspect')).toBe(true);
    expect(service.canPerformAction('inventory.movements.actions.viewStock')).toBe(true);
    expect(service.canPerformAction('inventory.movements.actions.viewProduct')).toBe(true);
    expect(service.canPerformAction('inventory.movements.actions.viewBatch')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 27 customers.* controls matching backend registry', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module (1)
    expect(service.canUseModule('customers')).toBe(true);

    // 1 View
    expect(service.canUseView('customers.views.desktopCards')).toBe(true);

    // 7 Features
    expect(service.canUseView('customers.features.moduleInfo')).toBe(true);
    expect(service.canUseView('customers.features.search')).toBe(true);
    expect(service.canUseView('customers.features.statusFilter')).toBe(true);
    expect(service.canUseView('customers.features.kpiCards')).toBe(true);
    expect(service.canUseView('customers.features.inspector')).toBe(true);
    expect(service.canUseView('customers.features.technicalDetails')).toBe(true);
    expect(service.canUseView('customers.features.creditSection')).toBe(true);

    // 9 Fields
    expect(service.canViewField('customers.fields.name')).toBe(true);
    expect(service.canEditField('customers.fields.name')).toBe(true);
    expect(service.canViewField('customers.fields.customerType')).toBe(true);
    expect(service.canEditField('customers.fields.customerType')).toBe(true);
    expect(service.canViewField('customers.fields.creditEnabled')).toBe(true);
    expect(service.canEditField('customers.fields.creditEnabled')).toBe(true);
    expect(service.canViewField('customers.fields.phone')).toBe(true);
    expect(service.canEditField('customers.fields.phone')).toBe(true);
    expect(service.canViewField('customers.fields.priceTier')).toBe(true);
    expect(service.canEditField('customers.fields.priceTier')).toBe(true);
    expect(service.canViewField('customers.fields.creditLimit')).toBe(true);
    expect(service.canEditField('customers.fields.creditLimit')).toBe(true);
    expect(service.canViewField('customers.fields.creditLimitBehaviour')).toBe(true);
    expect(service.canEditField('customers.fields.creditLimitBehaviour')).toBe(true);
    expect(service.canViewField('customers.fields.derivedBalances')).toBe(true);
    expect(service.canViewField('customers.fields.openingBalance')).toBe(true);

    // 9 Actions
    expect(service.canPerformAction('customers.actions.create')).toBe(true);
    expect(service.canPerformAction('customers.actions.inspect')).toBe(true);
    expect(service.canPerformAction('customers.actions.edit')).toBe(true);
    expect(service.canPerformAction('customers.actions.deactivate')).toBe(true);
    expect(service.canPerformAction('customers.actions.reactivate')).toBe(true);
    expect(service.canPerformAction('customers.actions.delete')).toBe(true);
    expect(service.canPerformAction('customers.actions.editCreditPolicy')).toBe(true);
    expect(service.canPerformAction('customers.actions.postOpeningBalance')).toBe(true);
    expect(service.canPerformAction('customers.actions.refresh')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 21 suppliers.* controls matching backend registry', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ organizationId: 'org-test' }),
          },
        },
      ],
    });

    const service = TestBed.inject(CapabilityService);

    // 1 Module
    expect(service.canUseModule('suppliers')).toBe(true);

    // 6 Features
    expect(service.canUseView('suppliers.features.moduleInfo')).toBe(true);
    expect(service.canUseView('suppliers.features.search')).toBe(true);
    expect(service.canUseView('suppliers.features.statusFilter')).toBe(true);
    expect(service.canUseView('suppliers.features.kpiCards')).toBe(true);
    expect(service.canUseView('suppliers.features.inspector')).toBe(true);
    expect(service.canUseView('suppliers.features.technicalDetails')).toBe(true);

    // 6 Fields
    expect(service.canViewField('suppliers.fields.name')).toBe(true);
    expect(service.canEditField('suppliers.fields.name')).toBe(true);
    expect(service.canViewField('suppliers.fields.contactName')).toBe(true);
    expect(service.canEditField('suppliers.fields.contactName')).toBe(true);
    expect(service.canViewField('suppliers.fields.phone')).toBe(true);
    expect(service.canEditField('suppliers.fields.phone')).toBe(true);
    expect(service.canViewField('suppliers.fields.email')).toBe(true);
    expect(service.canEditField('suppliers.fields.email')).toBe(true);
    expect(service.canViewField('suppliers.fields.derivedBalances')).toBe(true);
    expect(service.canViewField('suppliers.fields.openingBalance')).toBe(true);

    // 8 Actions
    expect(service.canPerformAction('suppliers.actions.create')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.inspect')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.edit')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.deactivate')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.reactivate')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.delete')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.postOpeningBalance')).toBe(true);
    expect(service.canPerformAction('suppliers.actions.refresh')).toBe(true);
  });

  it('provides default enabled/visible/allowed values for all 26 accounts.* controls', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    // Root module (1)
    expect(service.canUseModule('accounts')).toBe(true);

    // 5 Features
    expect(service.canUseView('accounts.features.moduleInfo')).toBe(true);
    expect(service.canUseView('accounts.features.search')).toBe(true);
    expect(service.canUseView('accounts.features.statusFilter')).toBe(true);
    expect(service.canUseView('accounts.features.movementHistory')).toBe(true);
    expect(service.canUseView('accounts.features.kpiCards')).toBe(true);

    // 8 Fields
    expect(service.canViewField('accounts.fields.name')).toBe(true);
    expect(service.canEditField('accounts.fields.name')).toBe(true);
    expect(service.canViewField('accounts.fields.accountType')).toBe(true);
    expect(service.canEditField('accounts.fields.accountType')).toBe(false);
    expect(service.canViewField('accounts.fields.status')).toBe(true);
    expect(service.canEditField('accounts.fields.status')).toBe(false);
    expect(service.canViewField('accounts.fields.derivedBalance')).toBe(true);
    expect(service.canViewField('accounts.fields.bankName')).toBe(true);
    expect(service.canEditField('accounts.fields.bankName')).toBe(true);
    expect(service.canViewField('accounts.fields.accountNumberMasked')).toBe(true);
    expect(service.canEditField('accounts.fields.accountNumberMasked')).toBe(true);
    expect(service.canViewField('accounts.fields.walletIdentifier')).toBe(true);
    expect(service.canEditField('accounts.fields.walletIdentifier')).toBe(true);
    expect(service.canViewField('accounts.fields.openingBalance')).toBe(true);

    // 12 Actions
    expect(service.canPerformAction('accounts.actions.create')).toBe(true);
    expect(service.canPerformAction('accounts.actions.inspect')).toBe(true);
    expect(service.canPerformAction('accounts.actions.edit')).toBe(true);
    expect(service.canPerformAction('accounts.actions.deactivate')).toBe(true);
    expect(service.canPerformAction('accounts.actions.reactivate')).toBe(true);
    expect(service.canPerformAction('accounts.actions.delete')).toBe(true);
    expect(service.canPerformAction('accounts.actions.postOpeningBalance')).toBe(true);
    expect(service.canPerformAction('accounts.actions.postManualMovement')).toBe(true);
    expect(service.canPerformAction('accounts.actions.transfer')).toBe(true);
    expect(service.canPerformAction('accounts.actions.reverseMovement')).toBe(true);
    expect(service.canPerformAction('accounts.actions.reverseTransfer')).toBe(true);
    expect(service.canPerformAction('accounts.actions.refresh')).toBe(true);
  });
  it('provides the exact 22 Reports defaults and wires module route/navigation gating', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    const availabilityKeys = Object.values(REPORT_CAPABILITY_KEY_BY_REPORT_KEY);
    const actionKeys = ['reports.actions.run', ...Object.values(REPORT_EXPORT_ACTION_BY_FORMAT)];
    const allKeys = [
      'reports',
      'reports.features.moduleInfo',
      ...availabilityKeys,
      ...actionKeys,
    ];

    expect(allKeys).toHaveLength(22);
    expect(new Set(allKeys).size).toBe(22);
    expect(service.canUseModule('reports')).toBe(true);
    expect(service.canUseView('reports.features.moduleInfo')).toBe(true);
    for (const key of availabilityKeys) {
      expect(service.canUseView(key)).toBe(true);
    }
    for (const key of actionKeys) {
      expect(service.canPerformAction(key)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    const reportsRoute = app?.children?.find((route) => route.path === 'reports');
    expect(reportsRoute?.canActivate).toHaveLength(1);

    const reportsNav = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    ).find((item) => item.id === 'insights.reports');
    expect(reportsNav).toMatchObject({
      permission: 'reports.view',
      capabilityKey: 'reports',
    });
  });

  it('provides the exact 13 Alerts defaults and wires module route/navigation gating', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    const featureKeys = [
      'alerts.features.moduleInfo',
      'alerts.features.summaryCards',
      'alerts.features.navbarNotifications',
    ];
    const alertTypeKeys = [
      'alerts.alertTypeAvailability.lowStock',
      'alerts.alertTypeAvailability.upcomingExpiry',
      'alerts.alertTypeAvailability.expiredStock',
      'alerts.alertTypeAvailability.deadStock',
      'alerts.alertTypeAvailability.customerDues',
      'alerts.alertTypeAvailability.supplierDues',
    ];
    const actionKeys = [
      'alerts.actions.acknowledge',
      'alerts.actions.markRead',
      'alerts.actions.markAllRead',
    ];
    const allKeys = [
      'alerts',
      ...featureKeys,
      ...alertTypeKeys,
      ...actionKeys,
    ];

    expect(allKeys).toHaveLength(13);
    expect(new Set(allKeys).size).toBe(13);
    expect(service.canUseModule('alerts')).toBe(true);
    for (const key of featureKeys) {
      expect(service.canUseFeature(key)).toBe(true);
    }
    for (const key of alertTypeKeys) {
      expect(service.canUseFeature(key)).toBe(true);
    }
    for (const key of actionKeys) {
      expect(service.canPerformAction(key)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    const alertsRoute = app?.children?.find((route) => route.path === 'alerts');
    expect(alertsRoute?.canActivate).toHaveLength(1);

    const alertsNav = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    ).find((item) => item.id === 'insights.alerts');
    expect(alertsNav).toMatchObject({
      permission: 'alerts.view',
      capabilityKey: 'alerts',
    });
  });

  it('provides the exact 26 Purchases defaults and wires granular routes/navigation', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    const features = ['moduleInfo', 'search', 'statusFilter'];
    const fields = [
      'branch',
      'supplierInvoiceReference',
      'notes',
      'packagingUnit',
      'manufacturingDate',
      'landedCosts',
      'warehouse',
      'supplier',
      'purchaseDate',
      'product',
      'quantity',
      'unitCost',
      'batchNumber',
      'expiryDate',
    ];
    const actions = [
      'createDraft',
      'inspect',
      'editDraft',
      'discardDraft',
      'post',
      'cancel',
      'createReturn',
      'addPaymentAtPost',
    ];
    const allKeys = [
      'purchases',
      ...features.map((id) => `purchases.features.${id}`),
      ...fields.map((id) => `purchases.fields.${id}`),
      ...actions.map((id) => `purchases.actions.${id}`),
    ];

    expect(allKeys).toHaveLength(26);
    expect(new Set(allKeys).size).toBe(26);
    expect(service.canUseModule('purchases')).toBe(true);
    for (const id of features) expect(service.canUseFeature(`purchases.features.${id}`)).toBe(true);
    for (const id of fields) {
      expect(service.canViewField(`purchases.fields.${id}`)).toBe(true);
      expect(service.canEditField(`purchases.fields.${id}`)).toBe(true);
    }
    for (const id of actions) expect(service.canPerformAction(`purchases.actions.${id}`)).toBe(true);

    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.children?.find((route) => route.path === 'purchases')?.canActivate).toHaveLength(1);
    expect(app?.children?.find((route) => route.path === 'purchases/new')?.canActivate).toHaveLength(2);
    expect(app?.children?.find((route) => route.path === 'purchases/:id')?.canActivate).toHaveLength(2);
    const purchasesNav = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    ).find((item) => item.id === 'purchases.list');
    expect(purchasesNav).toMatchObject({ permission: 'purchases.view', capabilityKey: 'purchases' });
  });

  it('provides the exact 17 Supplier Payments defaults and wires routes/navigation', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    const features = ['moduleInfo', 'paymentDateFilter'];
    const editableFields = [
      'notes',
      'supplier',
      'account',
      'allocationMode',
      'amount',
      'paymentDate',
      'allocations',
    ];
    const visibleFields = ['paymentReference', 'status'];
    const actions = ['post', 'postInvoiceSpecific', 'inspect', 'viewLedger', 'correct'];
    const allKeys = [
      'payments.supplier',
      ...features.map((id) => `payments.supplier.features.${id}`),
      ...editableFields.map((id) => `payments.supplier.fields.${id}`),
      ...visibleFields.map((id) => `payments.supplier.fields.${id}`),
      ...actions.map((id) => `payments.supplier.actions.${id}`),
    ];

    expect(allKeys).toHaveLength(17);
    expect(new Set(allKeys).size).toBe(17);
    expect(service.canUseModule('payments.supplier')).toBe(true);
    for (const id of features) {
      expect(service.canUseFeature(`payments.supplier.features.${id}`)).toBe(true);
    }
    for (const id of editableFields) {
      expect(service.canViewField(`payments.supplier.fields.${id}`)).toBe(true);
      expect(service.canEditField(`payments.supplier.fields.${id}`)).toBe(true);
    }
    for (const id of visibleFields) {
      expect(service.canViewField(`payments.supplier.fields.${id}`)).toBe(true);
      expect(service.canEditField(`payments.supplier.fields.${id}`)).toBe(false);
    }
    for (const id of actions) {
      expect(service.canPerformAction(`payments.supplier.actions.${id}`)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.children?.find((route) => route.path === 'supplier-payments')?.canActivate).toHaveLength(1);
    expect(app?.children?.find((route) => route.path === 'supplier-payments/new')?.canActivate).toHaveLength(2);

    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'purchases.supplier-payments')).toMatchObject({
      permission: 'supplier-payments.view',
      capabilityKey: 'payments.supplier',
    });
  });

  it('exposes authoritative read-only defaults for Supplier Ledger (17 controls)', () => {
    const service = TestBed.inject(CapabilityService);
    const features = ['moduleInfo', 'supplierSearch', 'reconciliationSummary', 'ledgerFilters'];
    const fields = [
      'supplierIdentity',
      'outstandingPayable',
      'supplierAdvance',
      'reconciliationStatus',
      'allocationTotal',
      'date',
      'reference',
      'entryType',
      'effectKind',
      'signedAmount',
      'sourceStatus',
    ];
    const actions = ['viewSource'];
    const allKeys = [
      'payments.supplierLedger',
      ...features.map((id) => `payments.supplierLedger.features.${id}`),
      ...fields.map((id) => `payments.supplierLedger.fields.${id}`),
      ...actions.map((id) => `payments.supplierLedger.actions.${id}`),
    ];

    expect(allKeys).toHaveLength(17);
    expect(new Set(allKeys).size).toBe(17);
    expect(service.canUseModule('payments.supplierLedger')).toBe(true);
    for (const id of features) {
      expect(service.canUseFeature(`payments.supplierLedger.features.${id}`)).toBe(true);
    }
    for (const id of fields) {
      expect(service.canViewField(`payments.supplierLedger.fields.${id}`)).toBe(true);
      expect(service.canEditField(`payments.supplierLedger.fields.${id}`)).toBe(false);
    }
    for (const id of actions) {
      expect(service.canPerformAction(`payments.supplierLedger.actions.${id}`)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.children?.find((route) => route.path === 'supplier-payments/ledger')?.canActivate).toHaveLength(1);

    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'purchases.supplier-ledger')).toMatchObject({
      permission: 'supplier-payments.view',
      capabilityKey: 'payments.supplierLedger',
    });
  });

  it('exposes authoritative defaults for Sales (34 controls) and routes', () => {
    const service = TestBed.inject(CapabilityService);
    const features = ['search', 'statusFilter', 'customerSearch', 'productSearch'];
    const editableFields = [
      'customer',
      'notes',
      'packagingUnit',
      'branch',
      'warehouse',
      'saleDate',
      'product',
      'quantity',
      'unitPrice',
    ];
    const visibleOnlyFields = [
      'invoiceNumber',
      'lifecycleStatus',
      'saleTotal',
      'paidTotal',
      'receivableTotal',
      'paymentDetails',
    ];
    const actions = [
      'createDraft',
      'inspect',
      'editDraft',
      'discardDraft',
      'post',
      'cancel',
      'print',
      'createReturn',
      'addPaymentAtPost',
      'sellOnCredit',
      'overridePrice',
      'approveCreditLimit',
      'approveExpiredStock',
      'overrideNegativeStock',
    ];
    const allKeys = [
      'sales',
      ...features.map((id) => `sales.features.${id}`),
      ...editableFields.map((id) => `sales.fields.${id}`),
      ...visibleOnlyFields.map((id) => `sales.fields.${id}`),
      ...actions.map((id) => `sales.actions.${id}`),
    ];

    expect(allKeys).toHaveLength(34);
    expect(new Set(allKeys).size).toBe(34);
    expect(service.canUseModule('sales')).toBe(true);
    for (const id of features) {
      expect(service.canUseFeature(`sales.features.${id}`)).toBe(true);
    }
    for (const id of editableFields) {
      expect(service.canViewField(`sales.fields.${id}`)).toBe(true);
      expect(service.canEditField(`sales.fields.${id}`)).toBe(true);
    }
    for (const id of visibleOnlyFields) {
      expect(service.canViewField(`sales.fields.${id}`)).toBe(true);
      expect(service.canEditField(`sales.fields.${id}`)).toBe(false);
    }
    for (const id of actions) {
      expect(service.canPerformAction(`sales.actions.${id}`)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.children?.find((route) => route.path === 'sales')?.canActivate).toHaveLength(1);
    expect(app?.children?.find((route) => route.path === 'sales/new')?.canActivate).toHaveLength(2);
    expect(app?.children?.find((route) => route.path === 'sales/:id/print')?.canActivate).toHaveLength(2);
    expect(app?.children?.find((route) => route.path === 'sales/:id')?.canActivate).toHaveLength(2);

    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'sales.new')).toMatchObject({
      permission: 'sales.view',
      capabilityKey: 'sales',
      actionCapabilityKey: 'sales.actions.createDraft',
    });
    expect(navigation.find((item) => item.id === 'sales.history')).toMatchObject({
      permission: 'sales.view',
      capabilityKey: 'sales',
    });
  });

  it('provides default enabled/visible values for all 11 dashboard.* controls and route guard', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);

    const features = ['datePeriodFilter', 'branchFilter', 'warehouseFilter'] as const;
    const widgets = [
      'financialSummary',
      'accountSummary',
      'salesVsPurchasesTrend',
      'grossProfitTrend',
      'topSellingProducts',
      'inventoryHealth',
      'recentSales',
    ] as const;

    const allKeys = [
      'dashboard',
      ...features.map((id) => `dashboard.features.${id}`),
      ...widgets.map((id) => `dashboard.widgets.${id}`),
    ];

    expect(allKeys).toHaveLength(11);
    expect(new Set(allKeys).size).toBe(11);

    expect(service.canUseModule('dashboard')).toBe(true);
    for (const id of features) {
      expect(service.canUseFeature(`dashboard.features.${id}`)).toBe(true);
    }
    for (const id of widgets) {
      expect(service.canShowWidget(`dashboard.widgets.${id}`)).toBe(true);
    }

    const app = appRoutes.find((route) => route.path === 'app');
    expect(app?.children?.find((route) => route.path === 'dashboard')?.canActivate).toHaveLength(1);

    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'dashboard')).toMatchObject({
      permission: 'dashboard.view',
      capabilityKey: 'dashboard',
    });
  });

  it('provides Setup defaults and route/navigation guards', () => {
    TestBed.configureTestingModule({
      providers: [
        CapabilityService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => ({ contextType: 'organization', organizationId: 'org-1' }),
          },
        },
      ],
    });
    const service = TestBed.inject(CapabilityService);
    for (const id of [
      'moduleInfo',
      'summary',
      'subscriptionNotice',
      'search',
      'statusFilter',
      'taskList',
      'operationalReadiness',
      'notes',
    ]) {
      expect(service.canUseFeature(`setup.features.${id}`)).toBe(true);
    }
    expect(service.canUseModule('setup')).toBe(true);
    expect(service.canPerformAction('setup.actions.refresh')).toBe(true);

    const app = appRoutes.find((route) => route.path === 'app');
    expect(
      app?.children?.find((route) => route.path === 'organization/setup')?.canActivate,
    ).toHaveLength(2);
    const navigation = CANONICAL_NAVIGATION.flatMap((entry) =>
      entry.type === 'group' ? entry.group.children : [entry.item],
    );
    expect(navigation.find((item) => item.id === 'organization.setup')).toMatchObject({
      permission: 'settings.view',
      capabilityKey: 'setup',
    });
  });
});
