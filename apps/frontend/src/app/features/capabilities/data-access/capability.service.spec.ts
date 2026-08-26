import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilitiesApi } from './capabilities.api';
import { CapabilityService } from './capability.service';

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
});
