import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditInquiryPage } from './audit-inquiry.page';
import { AuditApi } from '../../data-access/audit.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { AuditEventItem } from '../../models/audit.models';

describe('AuditInquiryPage', () => {
  let component: AuditInquiryPage;
  let fixture: ComponentFixture<AuditInquiryPage>;
  let mockQuery: ReturnType<typeof vi.fn>;
  let mockGetById: ReturnType<typeof vi.fn>;
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
        meta: { page: (filters['page'] as number) || 1, pageSize: (filters['pageSize'] as number) || 25, total: 3 },
      }),
    );

    mockGetById = vi.fn((id: string) => {
      const found = mockEvents.find((e) => e.id === id) || mockEvents[0];
      return of(found);
    });

    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;

    await TestBed.configureTestingModule({
      imports: [AuditInquiryPage],
      providers: [
        {
          provide: AuditApi,
          useValue: {
            query: mockQuery,
            getById: mockGetById,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: hasPermissionFn,
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
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

  it('renders dense table with formatted timestamps, actors, and friendly action labels', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('usr-admin');
    expect(text).toContain('Subscription status changed');
    expect(text).toContain('System');
    expect(text).toContain('Sale posted');
    expect(text).toContain('custom.unmapped_event'); // Safe raw code for unmapped action

    const systemPill = fixture.nativeElement.querySelector('.actor-pill--system');
    expect(systemPill).toBeTruthy();
    expect(systemPill.textContent.trim()).toBe('System');

    const table = fixture.nativeElement.querySelector('[data-testid="audit-table"]');
    expect(table).toBeTruthy();
  });

  it('applies server-side filters and resets page to 1', () => {
    component.actorId.set('usr-admin');
    component.action.set('sale.posted');
    component.reason.set('POS');
    mockQuery.mockClear();

    component.onSearchSubmit();

    expect(component.page()).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'usr-admin',
        action: 'sale.posted',
        reason: 'POS',
        page: 1,
      }),
      false,
    );
  });

  it('clears all active filters and re-queries from page 1', () => {
    component.actorId.set('usr-admin');
    component.action.set('sale.posted');
    component.from.set('2026-09-01T00:00');
    expect(component.hasActiveFilters()).toBe(true);

    mockQuery.mockClear();
    component.clearFilters();

    expect(component.actorId()).toBe('');
    expect(component.action()).toBe('');
    expect(component.from()).toBe('');
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
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }), false);
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

  it('hides filter inputs when audit.features.filters is false', () => {
    capabilityState.set({
      'audit.features.filters': { enabled: false },
    });
    fixture.detectChanges();

    expect(component.canUseFilters()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="audit-from"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-actor"]')).toBeFalsy();
  });

  it('manages mobile filter drawer open, close, and active filter badge count', () => {
    expect(component.mobileFiltersOpen()).toBe(false);
    expect(component.activeFiltersCount()).toBe(0);

    component.actorId.set('usr-1');
    component.resourceType.set('sale');
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
});
