import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { NavigationService } from './navigation.service';
import { NavigationApi } from './navigation.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../capabilities/data-access/capability.service';

const ALL_PERMISSIONS = [
  'settings.view',
  'users.view',
  'catalog.view',
  'customers.view',
  'suppliers.view',
  'accounts.view',
  'expenses.view',
  'purchases.view',
  'supplier-payments.view',
  'sales.view',
  'returns.view',
  'customer-payments.view',
  'inventory.view',
  'dashboard.view',
  'alerts.view',
  'reports.view',
  'imports.preview',
  'audit.view',
  'subscription.billing-evidence.submit',
];

describe('NavigationService', () => {
  function setup(
    permissions: string[] = ALL_PERMISSIONS,
    initialHidden: string[] = [],
    contextType: 'organization' | 'platform' = 'organization',
    customApi?: {
      getPreferences: () => Observable<{
        hiddenItemIds: string[];
        groupOrder?: string[];
        itemOrderByGroup?: Record<string, string[]>;
      }>;
      updatePreferences: (payload: {
        hiddenItemIds: string[];
        groupOrder: string[];
        itemOrderByGroup: Record<string, string[]>;
      }) => Observable<{
        hiddenItemIds: string[];
        groupOrder: string[];
        itemOrderByGroup: Record<string, string[]>;
      }>;
    },
    capabilityValues: Readonly<Record<string, boolean>> = {},
  ) {
    const store = {
      activeContext: () => ({
        contextType,
        organizationId: 'org-1',
        role: contextType === 'platform' ? 'Super Admin' : 'Owner',
        permissions,
      }),
      hasPermission: (p: string) => permissions.includes(p),
    };

    let persisted = {
      hiddenItemIds: [...initialHidden],
      groupOrder: [] as string[],
      itemOrderByGroup: {} as Record<string, string[]>,
    };

    const api = customApi ?? {
      getPreferences: () => of({ ...persisted }),
      updatePreferences: (payload: {
        hiddenItemIds: string[];
        groupOrder: string[];
        itemOrderByGroup: Record<string, string[]>;
      }) => {
        persisted = {
          hiddenItemIds: [...payload.hiddenItemIds],
          groupOrder: [...payload.groupOrder],
          itemOrderByGroup: { ...payload.itemOrderByGroup },
        };
        return of({ ...persisted });
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: store },
        { provide: NavigationApi, useValue: api },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => capabilityValues[key] ?? true,
          },
        },
        NavigationService,
      ],
    });

    const service = TestBed.inject(NavigationService);
    return { service, api };
  }

  it('computes permitted entries based on active permissions and organization context', () => {
    const { service } = setup(['sales.view', 'dashboard.view']);
    const entries = service.permittedEntries();

    const ids = entries.map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(ids).toContain('dashboard');
    expect(ids).toContain('sales');
    expect(ids).not.toContain('purchases');
    expect(ids).not.toContain('inventory');
    expect(ids).not.toContain('platform');
  });

  it('hides platform administration in organization context and shows it in platform context', () => {
    const orgSetup = setup(['platform.organizations.view'], [], 'organization');
    const orgGroupIds = orgSetup.service
      .permittedEntries()
      .map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(orgGroupIds).not.toContain('platform');

    const platSetup = setup(['platform.organizations.view'], [], 'platform');
    const platGroupIds = platSetup.service
      .permittedEntries()
      .map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(platGroupIds).toContain('platform');
  });

  it('filters visible entries when hidden item IDs are loaded', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.hiddenItemIds.set(new Set(['sales.new', 'sales.history', 'sales.customer-payments']));

    const visible = service.userVisibleEntries();
    const groupIds = visible.map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(groupIds).not.toContain('sales');
    expect(groupIds).toContain('purchases');
  });

  it('hides only Stock on Hand navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.stock': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.stock');
    expect(itemIds).toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.batches');
    expect(itemIds).toContain('inventory.movements');
  });

  it('hides only Opening Stock navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.openingStock': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.stock');
    expect(itemIds).toContain('inventory.batches');
  });

  it('hides only Product Batches navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.batches': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.batches');
    expect(itemIds).toContain('inventory.stock');
    expect(itemIds).toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.movements');
  });

  it('hides only Stock Adjustments navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.adjustments': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.adjustments');
    expect(itemIds).toContain('inventory.stock');
    expect(itemIds).toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.batches');
    expect(itemIds).toContain('inventory.transfers');
    expect(itemIds).toContain('inventory.movements');
  });

  it('hides only Warehouse Transfers navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.transfers': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.transfers');
    expect(itemIds).toContain('inventory.stock');
    expect(itemIds).toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.batches');
    expect(itemIds).toContain('inventory.adjustments');
    expect(itemIds).toContain('inventory.movements');
  });

  it('hides only Inventory Reconciliation navigation when its organization module is disabled', () => {
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', undefined, {
      'inventory.reconciliation': false,
    });
    const inventory = service
      .permittedEntries()
      .find((entry) => entry.type === 'group' && entry.group.id === 'inventory');
    const itemIds =
      inventory && inventory.type === 'group'
        ? inventory.group.children.map((item) => item.id)
        : [];

    expect(itemIds).not.toContain('inventory.reconciliation');
    expect(itemIds).toContain('inventory.stock');
    expect(itemIds).toContain('inventory.opening-stock');
    expect(itemIds).toContain('inventory.batches');
    expect(itemIds).toContain('inventory.adjustments');
    expect(itemIds).toContain('inventory.transfers');
    expect(itemIds).toContain('inventory.movements');
  });

  it('performs normal search filtering only on currently visible items', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.hiddenItemIds.set(new Set(['operations.audit']));

    service.setSearchTerm('audit');
    const filtered = service.filteredEntries();
    expect(filtered.length).toBe(0);

    service.setSearchTerm('purchases');
    const filteredPurchases = service.filteredEntries();
    expect(filteredPurchases.length).toBeGreaterThan(0);
    expect(service.isGroupExpanded('purchases')).toBe(true);
  });

  it('customizer search searches ALL permitted items (including hidden)', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.hiddenItemIds.set(new Set(['operations.audit']));
    service.openCustomizer();

    service.setCustomizerSearchTerm('audit');
    const tree = service.customizerTree();
    expect(tree.entries.some((e) => e.type === 'group' && e.group.id === 'operations')).toBe(true);

    const auditItem = tree.entries.find((e) => e.type === 'group' && e.group.id === 'operations');
    const audit =
      auditItem && auditItem.type === 'group'
        ? auditItem.group.items.find((i) => i.id === 'operations.audit')
        : undefined;
    expect(auditItem).toBeDefined();
    expect(audit?.visible).toBe(false);
  });

  it('handles customizer draft state: toggling items, parent tri-state, and saving', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.openCustomizer();

    service.toggleDraftItem('sales.new');
    expect(service.customizerDraftHidden().has('sales.new')).toBe(true);

    let salesGroup = service
      .customizerTree()
      .entries.find((e) => e.type === 'group' && e.group.id === 'sales');
    expect(salesGroup && salesGroup.type === 'group' ? salesGroup.group.state : null).toBe(
      'indeterminate',
    );

    service.toggleDraftGroup('sales');
    salesGroup = service
      .customizerTree()
      .entries.find((e) => e.type === 'group' && e.group.id === 'sales');
    expect(salesGroup && salesGroup.type === 'group' ? salesGroup.group.state : null).toBe(
      'checked',
    );

    service.toggleDraftGroup('sales');
    salesGroup = service
      .customizerTree()
      .entries.find((e) => e.type === 'group' && e.group.id === 'sales');
    expect(salesGroup && salesGroup.type === 'group' ? salesGroup.group.state : null).toBe(
      'unchecked',
    );

    service.resetDraftToDefault();
    salesGroup = service
      .customizerTree()
      .entries.find((e) => e.type === 'group' && e.group.id === 'sales');
    expect(salesGroup && salesGroup.type === 'group' ? salesGroup.group.state : null).toBe(
      'checked',
    );

    service.toggleDraftItem('inventory.adjustments');
    service.saveCustomizer();
    expect(service.hiddenItemIds().has('inventory.adjustments')).toBe(true);
    expect(service.isCustomizerOpen()).toBe(false);
  });

  it('falls back safely to default all-permitted navigation if loading preferences fails', () => {
    const failingApi = {
      getPreferences: () => throwError(() => new Error('Network error')),
      updatePreferences: () => of({ hiddenItemIds: [], groupOrder: [], itemOrderByGroup: {} }),
    };

    const { service } = setup(ALL_PERMISSIONS, [], 'organization', failingApi);
    service.loadPreferences();

    expect(service.isLoaded()).toBe(true);
    expect(service.hiddenItemIds().size).toBe(0);
    expect(service.userVisibleEntries().length).toBeGreaterThan(0);
  });

  it('reorders groups and children in draft only until save, and ignores unknown IDs', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.groupOrder.set(['inventory', 'sales']);
    service.itemOrderByGroup.set({
      inventory: ['inventory.transfers', 'stale.item', 'inventory.products'],
    });

    const visible = service.userVisibleEntries();
    const topIds = visible.map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(topIds.indexOf('inventory')).toBeLessThan(topIds.indexOf('sales'));
    expect(topIds).toContain('purchases');

    const inventory = visible.find((e) => e.type === 'group' && e.group.id === 'inventory');
    expect(inventory && inventory.type === 'group' ? inventory.group.children[0]?.id : null).toBe(
      'inventory.transfers',
    );
    expect(
      inventory && inventory.type === 'group' ? inventory.group.children.map((c) => c.id) : [],
    ).toContain('inventory.stock');

    service.openCustomizer();
    service.moveDraftGroup('sales', -1);
    const draftIds = service
      .customizerTree()
      .entries.map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(draftIds.indexOf('sales')).toBeLessThan(draftIds.indexOf('inventory'));
    expect(
      service
        .userVisibleEntries()
        .map((e) => (e.type === 'item' ? e.item.id : e.group.id))
        .indexOf('inventory'),
    ).toBeLessThan(
      service
        .userVisibleEntries()
        .map((e) => (e.type === 'item' ? e.item.id : e.group.id))
        .indexOf('sales'),
    );

    service.moveDraftChild('inventory', 'inventory.products', -1);
    service.setCustomizerSearchTerm('products');
    expect(service.customizerTree().isFiltered).toBe(true);
    const before = service.customizerDraftGroupOrder();
    service.moveDraftGroup('sales', 1);
    expect(service.customizerDraftGroupOrder()).toEqual(before);

    service.setCustomizerSearchTerm('');
    service.saveCustomizer();
    const savedTop = service
      .userVisibleEntries()
      .map((e) => (e.type === 'item' ? e.item.id : e.group.id));
    expect(savedTop.indexOf('sales')).toBeLessThan(savedTop.indexOf('inventory'));
  });

  it('keeps hiddenItemIds-only preferences working without order fields', () => {
    const api = {
      getPreferences: () => of({ hiddenItemIds: ['sales.new'] }),
      updatePreferences: (payload: { hiddenItemIds: string[] }) =>
        of({
          hiddenItemIds: payload.hiddenItemIds,
          groupOrder: [],
          itemOrderByGroup: {},
        }),
    };
    const { service } = setup(ALL_PERMISSIONS, [], 'organization', api as never);
    service.loadPreferences();
    expect(service.hiddenItemIds().has('sales.new')).toBe(true);
    expect(service.groupOrder()).toEqual([]);
    expect(
      service.userVisibleEntries().some((e) => e.type === 'group' && e.group.id === 'sales'),
    ).toBe(true);
  });
});
