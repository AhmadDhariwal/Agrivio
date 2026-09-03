import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditInquiryPage } from './audit-inquiry.page';
import { AuditApi } from '../../data-access/audit.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { OrganizationSettingsApi } from '../../../organization/data-access/organization-settings.api';
import { AuditEventItem } from '../../models/audit.models';

describe('AuditInquiryPage', () => {
  let component: AuditInquiryPage;
  let fixture: ComponentFixture<AuditInquiryPage>;
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockGetById: ReturnType<typeof vi.fn>;
  let mockGetFilterOptions: ReturnType<typeof vi.fn>;
  let mockGetActorOptions: ReturnType<typeof vi.fn>;
  let mockGetSummary: ReturnType<typeof vi.fn>;
  let capabilityState: ReturnType<typeof signal<Record<string, Record<string, boolean>>>>;
  let hasPermissionFn: ReturnType<typeof vi.fn>;

  const mockEvents: AuditEventItem[] = [
    {
      id: 'evt-1',
      organizationId: 'org-1',
      actorId: 'usr-admin',
      action: 'subscription.status_transition',
      resourceType: 'subscription',
      resourceId: 'sub-456',
      reason: 'Upgraded to enterprise plan',
      requestId: 'req-001',
      occurredAt: '2026-09-02T10:30:00.000Z',
      metadata: { previousStatus: 'active', newStatus: 'upgraded' },
    },
    {
      id: 'evt-2',
      organizationId: 'org-1',
      actorId: 'system',
      action: 'sale.posted',
      resourceType: 'sale',
      resourceId: 'sale-789',
      reason: 'POS checkout complete',
      requestId: 'req-002',
      occurredAt: '2026-09-02T11:15:00.000Z',
      metadata: null,
    },
    {
      id: 'evt-3',
      organizationId: 'org-1',
      actorId: 'usr-guest',
      action: 'custom.unmapped_event',
      resourceType: 'custom_entity',
      resourceId: 'ce-99',
      reason: null,
      requestId: null,
      occurredAt: '2026-09-02T12:00:00.000Z',
      metadata: null,
    },
  ];

  beforeEach(async () => {
    capabilityState = signal({});
    hasPermissionFn = vi.fn((perm: string) => perm === 'audit.view');

    mockQuery = vi.fn((filters: Record<string, unknown>) =>
      of({
        items: mockEvents,
        meta: {
          page: (filters['page'] as number) || 1,
          pageSize: (filters['pageSize'] as number) || 25,
          total: 3,
        },
      }),
    );

    mockGetById = vi.fn((id: string) => {
      const found = mockEvents.find((e) => e.id === id) || mockEvents[0];
      return of(found);
    });

    mockGetFilterOptions = vi.fn((field: string) => {
      if (field === 'action')
        return of({ field, items: ['sale.posted', 'subscription.status_transition'] });
      if (field === 'resourceType') return of({ field, items: ['sale', 'subscription'] });
      if (field === 'reason')
        return of({ field, items: ['POS checkout complete', 'Upgraded to enterprise plan'] });
      return of({ field, items: [] });
    });
    mockGetActorOptions = vi.fn(() =>
      of({
        field: 'actorId',
        items: [
          { value: 'system', label: 'System', system: true },
          { value: 'usr-admin', label: 'Admin User (admin@example.com)' },
        ],
      }),
    );

    mockGetSummary = vi.fn(() =>
      of({
        totalEvents: 100,
        eventsToday: 15,
        uniqueActors: 8,
        resourceTypes: 6,
      }),
    );

    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;

    await TestBed.configureTestingModule({
      imports: [AuditInquiryPage],
      providers: [
        {
          provide: AuditApi,
          useValue: {
            query: mockQuery,
            getById: mockGetById,
            getFilterOptions: mockGetFilterOptions,
            getActorOptions: mockGetActorOptions,
            getSummary: mockGetSummary,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: hasPermissionFn,
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
            activeContext: () => ({ organizationId: 'org-1' }),
          },
        },
        {
          provide: OrganizationSettingsApi,
          useValue: {
            getOrganization: vi.fn(() => of({ timezone: 'Asia/Karachi' })),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => capabilityValue(key, 'enabled'),
            canUseFeature: (key: string) => capabilityValue(key, 'enabled'),
            canPerformAction: (key: string) => capabilityValue(key, 'allowed'),
            canViewField: (key: string) => capabilityValue(key, 'visible'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditInquiryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders page header and module info with Products visual parity', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('DATA & OPERATIONS');
    expect(text).toContain('Audit history');
    expect(text).toContain('3 events');
    expect(text).toContain('Read-only inquiry of organization audit events');

    const moduleInfo = fixture.nativeElement.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).toBeTruthy();
    expect(moduleInfo.textContent).toContain('About Audit History');
  });

  it('renders exactly 4 filter dropdowns: Actor, Action, Resource Type, Reason with authoritative server options', () => {
    const actorSelect = fixture.nativeElement.querySelector('[data-testid="audit-actor"]');
    const actionSelect = fixture.nativeElement.querySelector('[data-testid="audit-action"]');
    const resTypeSelect = fixture.nativeElement.querySelector(
      '[data-testid="audit-resource-type"]',
    );
    const reasonSelect = fixture.nativeElement.querySelector('[data-testid="audit-reason"]');

    expect(actorSelect).toBeTruthy();
    expect(actionSelect).toBeTruthy();
    expect(resTypeSelect).toBeTruthy();
    expect(reasonSelect).toBeTruthy();

    expect(actorSelect.textContent).toContain('All actors');
    expect(actorSelect.textContent).toContain('Admin User (admin@example.com)');
    expect(actorSelect.textContent).toContain('System');

    expect(actionSelect.textContent).toContain('All actions');
    expect(actionSelect.textContent).toContain('Sale posted');

    expect(resTypeSelect.textContent).toContain('All resource types');
    expect(resTypeSelect.textContent).toContain('sale');

    expect(reasonSelect.textContent).toContain('All reasons');
    expect(reasonSelect.textContent).toContain('POS checkout complete');

    // Confirm removed controls are not present
    expect(fixture.nativeElement.querySelector('[data-testid="audit-from"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-to"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-resource-id"]')).toBeFalsy();
  });

  it('renders dense table with formatted timestamps, actors, and friendly action labels', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Admin User (admin@example.com)');
    expect(text).toContain('Subscription status changed');
    expect(text).toContain('System');
    expect(text).toContain('Sale posted');
    expect(text).toContain('custom.unmapped_event');

    const systemPill = fixture.nativeElement.querySelector('.actor-pill--system');
    expect(systemPill).toBeTruthy();
    expect(systemPill.textContent.trim()).toBe('System');

    const table = fixture.nativeElement.querySelector('[data-testid="audit-table"]');
    expect(table).toBeTruthy();
  });

  it('applies server-side filters and resets page to 1', () => {
    component.onActorChange('usr-admin');
    component.onActionChange('sale.posted');
    component.onResourceTypeChange('sale');
    component.onReasonChange('POS checkout complete');
    mockQuery.mockClear();

    component.onSearchSubmit();

    expect(component.page()).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'usr-admin',
        action: 'sale.posted',
        resourceType: 'sale',
        reason: 'POS checkout complete',
        page: 1,
      }),
      false,
    );
  });

  it('queries page one immediately when an employee actor is selected', () => {
    component.page.set(3);
    mockQuery.mockClear();

    component.onActorChange('usr-admin');

    expect(component.page()).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'usr-admin', page: 1 }),
      false,
    );
  });

  it('does not submit filter searches when the search capability is disabled', () => {
    capabilityState.set({ 'audit.features.search': { enabled: false } });
    mockQuery.mockClear();

    component.onActorChange('usr-1');
    component.onSearchSubmit();

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('clears all active filters and re-queries from page 1', () => {
    component.onActorChange('usr-admin');
    component.onActionChange('sale.posted');
    expect(component.hasActiveFilters()).toBe(true);

    mockQuery.mockClear();
    component.clearFilters();

    expect(component.actorId()).toBe('');
    expect(component.action()).toBe('');
    expect(component.resourceType()).toBe('');
    expect(component.reason()).toBe('');
    expect(component.page()).toBe(1);
    expect(component.hasActiveFilters()).toBe(false);
    expect(mockQuery).toHaveBeenCalled();
  });

  it('handles server pagination page changes and page size changes', () => {
    mockQuery.mockClear();
    component.onPageChange(2);
    expect(component.page()).toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), false);

    mockQuery.mockClear();
    component.onPageSizeChange(50);
    expect(component.pageSize()).toBe(50);
    expect(component.page()).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
      false,
    );
  });

  it('opens and closes the slide-over inspector drawer to inspect event details and metadata', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="audit-inspector"]')).toBeFalsy();

    const targetEvent = mockEvents[0];
    expect(targetEvent).toBeDefined();
    if (!targetEvent) return;

    component.openInspector(targetEvent);
    fixture.detectChanges();

    const inspector = fixture.nativeElement.querySelector('[data-testid="audit-inspector"]');
    expect(inspector).toBeTruthy();
    expect(inspector.textContent).toContain('evt-1');
    expect(inspector.textContent).toContain('Subscription status changed');
    expect(inspector.textContent).toContain('previousStatus');
    expect(inspector.textContent).toContain('Immutable Record · Read-Only');

    // Close via close button or Escape
    component.handleEscape();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-inspector"]')).toBeFalsy();
  });

  it('removes the Actions column and inspect buttons completely when inspect capability is disabled', () => {
    capabilityState.set({
      'audit.actions.inspect': { allowed: false },
    });
    fixture.detectChanges();

    expect(component.canInspect()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="audit-inspect-btn"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.audit-table__th--actions')).toBeFalsy();
  });

  it('hides module info when audit.features.moduleInfo is false', () => {
    capabilityState.set({
      'audit.features.moduleInfo': { enabled: false },
    });
    fixture.detectChanges();

    expect(component.canUseModuleInfo()).toBe(false);
    expect(fixture.nativeElement.querySelector('agrivio-ui-module-info')).toBeFalsy();
  });

  it('hides search submit button when audit.features.search is false', () => {
    capabilityState.set({
      'audit.features.search': { enabled: false },
    });
    fixture.detectChanges();

    expect(component.canUseSearch()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="audit-search"]')).toBeFalsy();
  });

  it('hides filter dropdowns when audit.features.filters is false', () => {
    capabilityState.set({
      'audit.features.filters': { enabled: false },
    });
    fixture.detectChanges();

    expect(component.canUseFilters()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="audit-actor"]')).toBeFalsy();
  });

  it('manages mobile filter drawer open, close, and active filter badge count', () => {
    expect(component.mobileFiltersOpen()).toBe(false);
    expect(component.activeFiltersCount()).toBe(0);

    component.onActorChange('usr-1');
    component.onResourceTypeChange('sale');
    expect(component.activeFiltersCount()).toBe(2);

    component.openMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(true);

    component.closeMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(false);
  });

  it('enforces read-only integrity: contains no delete, edit, or mutate actions', () => {
    const html = fixture.nativeElement.innerHTML.toLowerCase();
    expect(html).not.toContain('delete');
    expect(html).not.toContain('edit');
    expect(html).not.toContain('restore');
    expect(html).not.toContain('cancel');
  });

  it('renders authoritative server-backed Audit KPIs and does not compute them from paginated items', () => {
    mockGetSummary.mockReturnValue(
      of({
        totalEvents: 1500,
        eventsToday: 24,
        uniqueActors: 12,
        resourceTypes: 9,
      }),
    );

    // Load summary and trigger change detection
    component.loadSummary();
    fixture.detectChanges();

    const kpiEl = fixture.nativeElement.querySelector('[data-testid="audit-kpis"]');
    expect(kpiEl).toBeTruthy();

    const totalEl = fixture.nativeElement.querySelector('[data-testid="audit-kpi-total-val"]');
    const todayEl = fixture.nativeElement.querySelector('[data-testid="audit-kpi-today-val"]');
    const actorsEl = fixture.nativeElement.querySelector('[data-testid="audit-kpi-actors-val"]');
    const resourcesEl = fixture.nativeElement.querySelector(
      '[data-testid="audit-kpi-resources-val"]',
    );

    expect(totalEl.textContent.trim()).toBe('1500');
    expect(todayEl.textContent.trim()).toBe('24');
    expect(actorsEl.textContent.trim()).toBe('12');
    expect(resourcesEl.textContent.trim()).toBe('9');

    // Confirm that KPIs are NOT derived from currently loaded paginated items (mockEvents.length is 3)
    expect(totalEl.textContent.trim()).not.toBe('3');
    expect(component.kpis().totalEvents).toBe(1500);
    expect(component.items().length).toBe(3);
  });

  it('force-refreshes both audit list and audit summary when refresh() is invoked', () => {
    component.refresh();
    expect(mockGetSummary).toHaveBeenCalledWith(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('toggles the actor dropdown open and closed on trigger click', () => {
    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="audit-actor-trigger"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(component.actorDropdownOpen()).toBe(false);

    trigger.click();
    fixture.detectChanges();
    expect(component.actorDropdownOpen()).toBe(true);

    trigger.click();
    fixture.detectChanges();
    expect(component.actorDropdownOpen()).toBe(false);
  });

  it('filters actor options when user searches in the actor dropdown', () => {
    mockGetActorOptions.mockReturnValue(
      of({
        field: 'actorId',
        items: [{ value: 'usr-admin', label: 'Admin User (admin@example.com)' }],
      }),
    );

    component.onActorOptionSearch('Admin');
    component.loadActorOptions('Admin');
    fixture.detectChanges();

    expect(component.actorOptionSearch()).toBe('Admin');
    expect(component.actorOptions()).toEqual([
      { value: 'usr-admin', label: 'Admin User (admin@example.com)' },
    ]);
  });

  it('selects an actor from the dropdown, updates label, resets page to 1, and closes the dropdown', () => {
    component.actorDropdownOpen.set(true);
    fixture.detectChanges();

    const adminOption = fixture.nativeElement.querySelector(
      '[data-testid="audit-actor-option-usr-admin"]',
    ) as HTMLButtonElement;
    expect(adminOption).toBeTruthy();

    mockQuery.mockClear();
    adminOption.click();
    fixture.detectChanges();

    expect(component.actorId()).toBe('usr-admin');
    expect(component.selectedActorLabel()).toBe('Admin User (admin@example.com)');
    expect(component.actorDropdownOpen()).toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'usr-admin', page: 1 }),
      false,
    );
  });

  it('closes actor dropdown on Escape key', () => {
    component.actorDropdownOpen.set(true);
    expect(component.actorDropdownOpen()).toBe(true);

    component.handleEscape();
    expect(component.actorDropdownOpen()).toBe(false);
  });

  it('closes actor dropdown on outside click', () => {
    component.actorDropdownOpen.set(true);
    expect(component.actorDropdownOpen()).toBe(true);

    const outsideDiv = document.createElement('div');
    document.body.appendChild(outsideDiv);

    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: outsideDiv });
    component.onDocumentClick(clickEvent);
    expect(component.actorDropdownOpen()).toBe(false);

    document.body.removeChild(outsideDiv);
  });

  it('renders subtle truthful audit retention notice with cutoff date and purge eligibility', () => {
    component.summary.set({
      totalEvents: 100,
      eventsToday: 10,
      uniqueActors: 5,
      resourceTypes: 4,
      retention: {
        retentionDays: 90,
        cutoffAt: '2026-06-05T00:00:00.000Z',
        oldestVisibleEventAt: '2026-06-05T12:00:00.000Z',
        automaticCleanupEnabled: false,
        nextCleanupAt: null,
        expiredEventCount: 0,
        retentionSource: 'subscription',
      },
    });
    fixture.detectChanges();

    const notice = fixture.nativeElement.querySelector('[data-testid="audit-retention-notice"]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('Audit history is retained for 90 days');
    expect(notice.textContent).toContain('eligible for purge');
    expect(notice.textContent).not.toContain('automatically removed');
  });

  it('renders indefinite retention notice for unlimited plans', () => {
    component.summary.set({
      totalEvents: 50,
      eventsToday: 2,
      uniqueActors: 3,
      resourceTypes: 2,
      retention: {
        retentionDays: null,
        cutoffAt: null,
        oldestVisibleEventAt: '2025-01-01T00:00:00.000Z',
        automaticCleanupEnabled: false,
        nextCleanupAt: null,
        expiredEventCount: 0,
        retentionSource: 'subscription',
      },
    });
    fixture.detectChanges();

    const notice = fixture.nativeElement.querySelector('[data-testid="audit-retention-notice"]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('retained indefinitely under your subscription plan');
  });

  it('formats unknown and known action labels into human-friendly text in dropdown options', () => {
    component.actionOptions.set(['customer.deleted', 'custom.unmapped_workflow']);
    fixture.detectChanges();

    const actionDropdown = fixture.nativeElement.querySelector('[data-testid="audit-action"]');
    expect(actionDropdown.textContent).toContain('Customer deleted');
    expect(actionDropdown.textContent).toContain('Custom unmapped workflow');
  });
});
