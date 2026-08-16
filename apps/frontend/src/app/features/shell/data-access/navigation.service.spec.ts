import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { NavigationService } from './navigation.service';
import { NavigationApi } from './navigation.api';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';

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
      getPreferences: () => Observable<{ hiddenItemIds: string[] }>;
      updatePreferences: (ids: string[]) => Observable<{ hiddenItemIds: string[] }>;
    },
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

    let persistedHidden = [...initialHidden];

    const api = customApi ?? {
      getPreferences: () => of({ hiddenItemIds: persistedHidden }),
      updatePreferences: (ids: string[]) => {
        persistedHidden = [...ids];
        return of({ hiddenItemIds: persistedHidden });
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: store },
        { provide: NavigationApi, useValue: api },
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
    expect(tree.groups.some((g) => g.id === 'operations')).toBe(true);

    const auditItem = tree.groups
      .find((g) => g.id === 'operations')
      ?.items.find((i) => i.id === 'operations.audit');
    expect(auditItem).toBeDefined();
    expect(auditItem?.visible).toBe(false);
  });

  it('handles customizer draft state: toggling items, parent tri-state, and saving', () => {
    const { service } = setup(ALL_PERMISSIONS);
    service.openCustomizer();

    service.toggleDraftItem('sales.new');
    expect(service.customizerDraftHidden().has('sales.new')).toBe(true);

    let salesGroup = service.customizerTree().groups.find((g) => g.id === 'sales');
    expect(salesGroup?.state).toBe('indeterminate');

    service.toggleDraftGroup('sales');
    salesGroup = service.customizerTree().groups.find((g) => g.id === 'sales');
    expect(salesGroup?.state).toBe('checked');

    service.toggleDraftGroup('sales');
    salesGroup = service.customizerTree().groups.find((g) => g.id === 'sales');
    expect(salesGroup?.state).toBe('unchecked');

    service.resetDraftToDefault();
    salesGroup = service.customizerTree().groups.find((g) => g.id === 'sales');
    expect(salesGroup?.state).toBe('checked');

    service.toggleDraftItem('inventory.adjustments');
    service.saveCustomizer();
    expect(service.hiddenItemIds().has('inventory.adjustments')).toBe(true);
    expect(service.isCustomizerOpen()).toBe(false);
  });

  it('falls back safely to default all-permitted navigation if loading preferences fails', () => {
    const failingApi = {
      getPreferences: () => throwError(() => new Error('Network error')),
      updatePreferences: () => of({ hiddenItemIds: [] }),
    };

    const { service } = setup(ALL_PERMISSIONS, [], 'organization', failingApi);
    service.loadPreferences();

    expect(service.isLoaded()).toBe(true);
    expect(service.hiddenItemIds().size).toBe(0);
    expect(service.userVisibleEntries().length).toBeGreaterThan(0);
  });
});
