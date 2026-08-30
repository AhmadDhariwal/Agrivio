import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import {
  OrganizationSetupPage,
  normalizeSetupStatus,
  setupStatusBadge,
  SETUP_STEP_DESCRIPTIONS,
} from './organization-setup.page';
import {
  OrganizationSetupApi,
  SetupProgress,
  SetupStep,
} from '../../data-access/organization-setup.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('OrganizationSetupPage', () => {
  let fixture: ComponentFixture<OrganizationSetupPage>;
  let component: OrganizationSetupPage;
  let getSetupProgressMock: ReturnType<typeof vi.fn>;
  let sessionSignal: ReturnType<typeof signal>;
  let activeContextSignal: ReturnType<typeof signal>;
  let hasPermissionMock: ReturnType<typeof vi.fn>;
  let canUseModuleMock: ReturnType<typeof vi.fn>;
  let canUseFeatureMock: ReturnType<typeof vi.fn>;
  let canPerformActionMock: ReturnType<typeof vi.fn>;

  const sampleSteps: SetupStep[] = [
    {
      id: 'organization_profile',
      title: 'Organization profile & settings',
      status: 'complete',
      href: '/app/organization/settings',
      permission: 'settings.view',
    },
    {
      id: 'branch',
      title: 'Create a branch',
      status: 'incomplete',
      href: '/app/branches',
      permission: 'branches.view',
    },
    {
      id: 'warehouse',
      title: 'Create a warehouse',
      status: 'blocked',
      href: '/app/warehouses',
      permission: 'warehouses.view',
    },
    {
      id: 'employees_access',
      title: 'Employees & access',
      status: 'complete',
      href: '/app/employees',
      permission: 'users.view',
    },
  ];

  const sampleProgress: SetupProgress = {
    steps: sampleSteps,
    readyForOperations: false,
    notes: ['Inventory/Purchases/Sales not in scope yet'],
  };

  beforeEach(() => {
    getSetupProgressMock = vi.fn().mockReturnValue(of(sampleProgress));
    sessionSignal = signal({
      user: { id: 'usr-1', email: 'owner@test.com' },
      subscriptionAccessState: null,
    });
    activeContextSignal = signal({
      organizationId: 'org-test-1',
      role: 'Owner',
    });
    hasPermissionMock = vi.fn().mockReturnValue(true);
    canUseModuleMock = vi.fn().mockReturnValue(true);
    canUseFeatureMock = vi.fn().mockReturnValue(true);
    canPerformActionMock = vi.fn().mockReturnValue(true);

    TestBed.configureTestingModule({
      imports: [OrganizationSetupPage],
      providers: [
        provideRouter([]),
        {
          provide: OrganizationSetupApi,
          useValue: {
            getSetupProgress: getSetupProgressMock,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            session: sessionSignal,
            activeContext: activeContextSignal,
            hasPermission: hasPermissionMock,
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: canUseModuleMock,
            canUseFeature: canUseFeatureMock,
            canPerformAction: canPerformActionMock,
          },
        },
      ],
    });
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(OrganizationSetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('Pure helper functions', () => {
    it('normalizes statuses correctly', () => {
      expect(normalizeSetupStatus('complete')).toBe('complete');
      expect(normalizeSetupStatus('in_progress')).toBe('in_progress');
      expect(normalizeSetupStatus('blocked')).toBe('blocked');
      expect(normalizeSetupStatus('incomplete')).toBe('not_started');
      expect(normalizeSetupStatus('not_started')).toBe('not_started');
      expect(normalizeSetupStatus('unexpected_status')).toBe('not_started');
    });

    it('maps statuses to badges with semantic tones', () => {
      expect(setupStatusBadge('complete')).toEqual({ label: 'Completed', tone: 'success' });
      expect(setupStatusBadge('in_progress')).toEqual({ label: 'In progress', tone: 'warning' });
      expect(setupStatusBadge('blocked')).toEqual({ label: 'Blocked', tone: 'danger' });
      expect(setupStatusBadge('incomplete')).toEqual({ label: 'Not started', tone: 'neutral' });
      expect(setupStatusBadge('not_started')).toEqual({ label: 'Not started', tone: 'neutral' });
    });
  });

  describe('Header Rendering', () => {
    it('renders Products-style header with eyebrow, title, lede, and completed count pill', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.page-head__eyebrow')?.textContent?.trim()).toBe('GETTING STARTED');
      expect(el.querySelector('.page-head__title')?.textContent?.trim()).toBe('Organization setup');
      expect(el.querySelector('.page-head__lede')?.textContent).toContain(
        'Complete these steps to prepare your organization for operations.',
      );
      // Completed count pill: 2/4 completed
      const countPill = el.querySelector('.page-head__count-pill');
      expect(countPill?.textContent?.trim()).toBe('2/4 completed');
    });
  });

  describe('Authoritative Tasks Rendering & UX', () => {
    it('renders all returned steps without exposing raw internal IDs to users', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      // Titles are displayed
      expect(el.textContent).toContain('Organization profile & settings');
      expect(el.textContent).toContain('Create a branch');
      expect(el.textContent).toContain('Create a warehouse');
      expect(el.textContent).toContain('Employees & access');

      // Human-readable descriptions are rendered
      expect(el.textContent).toContain(SETUP_STEP_DESCRIPTIONS['organization_profile']);
      expect(el.textContent).toContain(SETUP_STEP_DESCRIPTIONS['branch']);
      expect(el.textContent).toContain(SETUP_STEP_DESCRIPTIONS['warehouse']);
      expect(el.textContent).toContain(SETUP_STEP_DESCRIPTIONS['employees_access']);

      // Raw IDs like 'organization_profile' are NOT rendered as standalone text paragraphs
      const paragraphs = Array.from(el.querySelectorAll('.task-desc')).map((p) => p.textContent);
      for (const desc of paragraphs) {
        expect(desc).not.toBe('organization_profile');
        expect(desc).not.toBe('branch');
        expect(desc).not.toBe('warehouse');
      }
    });

    it('renders status badges with human labels instead of raw values', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      // Clean labels
      expect(el.textContent).toContain('Completed');
      expect(el.textContent).toContain('Not started');
      expect(el.textContent).toContain('Blocked');
      // Raw string 'incomplete' should NOT appear in badges
      const badges = Array.from(el.querySelectorAll('.ag-badge')).map((b) => b.textContent?.trim());
      expect(badges).toContain('Completed');
      expect(badges).toContain('Not started');
      expect(badges).toContain('Blocked');
      expect(badges).not.toContain('incomplete');
    });
  });

  describe('Summary KPI Area', () => {
    it('displays compact KPI cards with authoritative counts derived from loaded steps', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const kpiRow = el.querySelector('[data-testid="setup-kpi-row"]');
      expect(kpiRow).toBeTruthy();

      const completedCard = el.querySelector('[data-testid="setup-kpi-completed"]');
      const inProgressCard = el.querySelector('[data-testid="setup-kpi-in-progress"]');
      const notStartedCard = el.querySelector('[data-testid="setup-kpi-not-started"]');

      expect(completedCard?.textContent).toContain('2');
      expect(inProgressCard?.textContent).toContain('0');
      expect(notStartedCard?.textContent).toContain('1'); // branch is incomplete -> not_started
    });

    it('omits KPI summary row when no steps exist', () => {
      getSetupProgressMock.mockReturnValue(of({ steps: [], readyForOperations: false, notes: [] }));
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="setup-kpi-row"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-empty-state"]')).toBeTruthy();
    });
  });

  describe('Subscription / Billing Notice', () => {
    it('renders subscription notice when access state indicates grace period', () => {
      sessionSignal.set({
        user: { id: 'usr-1', email: 'owner@test.com' },
        subscriptionAccessState: {
          status: 'grace',
          graceEndsAt: '2026-09-15T00:00:00Z',
        },
      });
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const notice = el.querySelector('[data-testid="setup-subscription-notice"]');
      expect(notice).toBeTruthy();
      expect(notice?.textContent).toContain('Grace period');
      expect(notice?.textContent).toContain('Manage billing →');
    });

    it('does not render Manage Billing link if user lacks billing capability', () => {
      sessionSignal.set({
        user: { id: 'usr-1', email: 'owner@test.com' },
        subscriptionAccessState: {
          status: 'grace',
          graceEndsAt: '2026-09-15T00:00:00Z',
        },
      });
      canUseModuleMock.mockImplementation((key: string) => key !== 'billing');
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const manageBilling = el.querySelector('[data-testid="manage-billing-link"]');
      expect(manageBilling).toBeNull();
    });

    it('omits notice when subscription access state is normal/active without warnings', () => {
      sessionSignal.set({
        user: { id: 'usr-1', email: 'owner@test.com' },
        subscriptionAccessState: {
          status: 'active',
          warnings: [],
        },
      });
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="setup-subscription-notice"]')).toBeNull();
    });
  });

  describe('Toolbar & Filtering', () => {
    it('applies Setup presentation controls without changing the loaded DTO', () => {
      canUseFeatureMock.mockReturnValue(false);
      canPerformActionMock.mockReturnValue(false);
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(component.progress()).toEqual(sampleProgress);
      expect(el.querySelector('.page-head__title')?.textContent).toContain('Organization setup');
      expect(el.querySelector('.page-head__eyebrow')).toBeNull();
      expect(el.querySelector('.page-head__count-pill')).toBeNull();
      expect(el.querySelector('[data-testid="setup-kpi-row"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-subscription-notice"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-ready"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-steps"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-notes"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-refresh"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-search-input"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-status-filter"]')).toBeNull();
    });

    it('filters tasks locally by search query matching title or description', () => {
      createComponent();

      // Initially 4 steps
      expect(component.filteredSteps().length).toBe(4);

      // Search for 'branch'
      component.searchTerm.set('branch');
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(1);
      expect(component.filteredSteps()[0]?.title).toBe('Create a branch');

      // Search by description keyword (e.g. 'roles')
      component.searchTerm.set('roles');
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(1);
      expect(component.filteredSteps()[0]?.id).toBe('employees_access');

      // Clear filters
      component.clearFilters();
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(4);
    });

    it('filters tasks by normalized status', () => {
      createComponent();

      component.statusFilter.set('complete');
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(2);

      component.statusFilter.set('blocked');
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(1);
      expect(component.filteredSteps()[0]?.id).toBe('warehouse');

      component.statusFilter.set('not_started');
      fixture.detectChanges();
      expect(component.filteredSteps().length).toBe(1);
      expect(component.filteredSteps()[0]?.id).toBe('branch');
    });

    it('shows no-matches empty state when filter produces 0 results', () => {
      createComponent();

      component.searchTerm.set('xyz-nonexistent');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="setup-no-matches"]')).toBeTruthy();
    });
  });

  describe('Open Action & Permission/Capability Gating', () => {
    it('renders clickable Open link for permitted steps', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const branchLink = el.querySelector('[data-testid="setup-link-branch"]');
      expect(branchLink).toBeTruthy();
      expect(branchLink?.getAttribute('href')).toBe('/app/branches');
    });

    it('does not render actionable Open link for blocked steps', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      // Warehouse is 'blocked'
      const warehouseLink = el.querySelector('[data-testid="setup-link-warehouse"]');
      expect(warehouseLink).toBeNull();

      const restrictedLabel = el.querySelector('[data-testid="setup-restricted-warehouse"]');
      expect(restrictedLabel).toBeTruthy();
      expect(restrictedLabel?.textContent?.trim()).toBe('Restricted');
    });

    it('restricts Open action if user lacks step permission', () => {
      hasPermissionMock.mockImplementation((perm: string) => perm !== 'branches.view');
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const branchLink = el.querySelector('[data-testid="setup-link-branch"]');
      expect(branchLink).toBeNull();

      const restricted = el.querySelector('[data-testid="setup-restricted-branch"]');
      expect(restricted).toBeTruthy();
    });

    it('restricts Open action if destination capability is disabled', () => {
      canUseModuleMock.mockImplementation((mod: string) => mod !== 'inventory.products');
      getSetupProgressMock.mockReturnValue(
        of({
          steps: [
            {
              id: 'catalog',
              title: 'Categories & products',
              status: 'incomplete',
              href: '/app/products',
              permission: 'catalog.view',
            },
          ],
          readyForOperations: false,
          notes: [],
        }),
      );
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const catalogLink = el.querySelector('[data-testid="setup-link-catalog"]');
      expect(catalogLink).toBeNull();

      const restricted = el.querySelector('[data-testid="setup-restricted-catalog"]');
      expect(restricted).toBeTruthy();
    });

    it('keeps Customers destination access independent from Setup controls', () => {
      canUseModuleMock.mockImplementation((mod: string) => mod !== 'customers');
      getSetupProgressMock.mockReturnValue(
        of({
          steps: [
            {
              id: 'customers',
              title: 'Customers',
              status: 'incomplete',
              href: '/app/customers',
              permission: 'customers.view',
            },
          ],
          readyForOperations: false,
          notes: [],
        }),
      );
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[data-testid="setup-link-customers"]')).toBeNull();
      expect(el.querySelector('[data-testid="setup-restricted-customers"]')).toBeTruthy();
    });
  });

  describe('Refresh & QueryCache Behavior', () => {
    it('performs one initial setup progress request on load with forceRefresh=false', () => {
      createComponent();
      expect(getSetupProgressMock).toHaveBeenCalledTimes(1);
      expect(getSetupProgressMock).toHaveBeenCalledWith();
    });

    it('triggers one forceRefresh request when clicking Refresh button', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const refreshBtn = el.querySelector('[data-testid="setup-refresh"]') as HTMLButtonElement;
      expect(refreshBtn).toBeTruthy();

      refreshBtn.click();
      expect(getSetupProgressMock).toHaveBeenCalledTimes(2);
      expect(getSetupProgressMock).toHaveBeenLastCalledWith(true);
    });
  });

  describe('Loading and Error States', () => {
    it('renders error alert and retry button when setup progress API fails', () => {
      getSetupProgressMock.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { error: { message: 'Server error' } }, status: 500 })),
      );
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Server error');
      const retryBtn = el.querySelector('[data-testid="setup-retry-btn"]') as HTMLButtonElement;
      expect(retryBtn).toBeTruthy();

      // Retry
      getSetupProgressMock.mockReturnValue(of(sampleProgress));
      retryBtn.click();
      fixture.detectChanges();
      expect(el.textContent).toContain('Organization profile & settings');
    });
  });

  describe('Operational Readiness Banner', () => {
    it('renders setup-ready banner when readyForOperations is true', () => {
      getSetupProgressMock.mockReturnValue(
        of({
          steps: sampleSteps,
          readyForOperations: true,
          notes: [],
        }),
      );
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const readyAlert = el.querySelector('[data-testid="setup-ready"]');
      expect(readyAlert).toBeTruthy();
      expect(readyAlert?.textContent).toContain('All setup steps are complete');
    });
  });

  describe('Mobile Cards Rendering', () => {
    it('renders mobile card structure alongside desktop table', () => {
      createComponent();
      const el = fixture.nativeElement as HTMLElement;

      const mobileCardsContainer = el.querySelector('[data-testid="setup-steps-mobile"]');
      expect(mobileCardsContainer).toBeTruthy();

      const mobileCards = el.querySelectorAll('.setup-mobile-card');
      expect(mobileCards.length).toBe(sampleSteps.length);
    });
  });
});
