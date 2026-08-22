import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
});
