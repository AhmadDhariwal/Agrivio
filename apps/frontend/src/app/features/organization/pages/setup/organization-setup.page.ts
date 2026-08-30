import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  OrganizationSetupApi,
  SetupProgress,
  SetupStep,
} from '../../data-access/organization-setup.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import {
  SubscriptionAccessState,
  buildSubscriptionBanner,
} from '../../../subscriptions/data-access/subscription-access.util';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

export type NormalizedSetupStatus = 'complete' | 'in_progress' | 'not_started' | 'blocked';

export function normalizeSetupStatus(status: string): NormalizedSetupStatus {
  if (status === 'complete') return 'complete';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'blocked') return 'blocked';
  // Backend 'incomplete', 'not_started', and unexpected values map to 'not_started'
  return 'not_started';
}

export function setupStatusBadge(status: string): { label: string; tone: UiBadgeTone } {
  const normalized = normalizeSetupStatus(status);
  switch (normalized) {
    case 'complete':
      return { label: 'Completed', tone: 'success' };
    case 'in_progress':
      return { label: 'In progress', tone: 'warning' };
    case 'blocked':
      return { label: 'Blocked', tone: 'danger' };
    case 'not_started':
    default:
      return { label: 'Not started', tone: 'neutral' };
  }
}

export const SETUP_STEP_DESCRIPTIONS: Readonly<Record<string, string>> = {
  organization_profile: 'Set your organization details, business contact, and basic preferences.',
  branch: 'Add your operating branches and primary business locations.',
  warehouse: 'Add storage locations and warehouses for inventory and stock management.',
  employees_access: 'Invite team members, configure user profiles, and assign access roles.',
  catalog: 'Build your product categories and master product catalog.',
  packaging: 'Configure measurement units, packaging levels, and conversion factors.',
  pricing: 'Set up multi-tier price lists and customer rate structures.',
  customers: 'Add buyer profiles, commercial contacts, and client accounts.',
  suppliers: 'Add vendor profiles and procurement partners for purchasing.',
  accounts: 'Set up your chart of accounts and payment method ledgers.',
  opening_balances: 'Post opening financial, customer, supplier, and inventory balances.',
};

const STEP_CAPABILITY_KEYS: Readonly<Record<string, string>> = {
  '/app/products': 'inventory.products',
  '/app/categories': 'inventory.categories',
  '/app/warehouses': 'warehouses',
  '/app/employees': 'employees',
  '/app/accounts': 'accounts',
  '/app/customers': 'customers',
  '/app/suppliers': 'suppliers',
};

const STEP_DESTINATION_PERMISSIONS: Readonly<Record<string, string>> = {
  '/app/warehouses': 'warehouses.manage',
};

@Component({
  selector: 'agrivio-organization-setup-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './organization-setup.page.html',
  styleUrl: './organization-setup.page.scss',
})
export class OrganizationSetupPage {
  private readonly api = inject(OrganizationSetupApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly progress = signal<SetupProgress | null>(null);
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<string>('all');

  // Subscription / Billing Notice State
  readonly accessState = computed(
    () =>
      (this.sessionStore.session()?.subscriptionAccessState as SubscriptionAccessState | null) ??
      null,
  );

  readonly moduleInfoEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.moduleInfo'),
  );
  readonly summaryEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.summary'),
  );
  readonly subscriptionNoticeEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.subscriptionNotice'),
  );
  readonly searchEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.search'),
  );
  readonly statusFilterEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.statusFilter'),
  );
  readonly taskListEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.taskList'),
  );
  readonly operationalReadinessEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.operationalReadiness'),
  );
  readonly notesEnabled = computed(() =>
    this.capabilityService.canUseFeature('setup.features.notes'),
  );
  readonly refreshEnabled = computed(() =>
    this.capabilityService.canPerformAction('setup.actions.refresh'),
  );
  readonly toolbarEnabled = computed(
    () => this.searchEnabled() || this.statusFilterEnabled() || this.refreshEnabled(),
  );

  readonly subscriptionNotice = computed(() =>
    this.subscriptionNoticeEnabled() ? buildSubscriptionBanner(this.accessState()) : null,
  );

  readonly canManageBilling = computed(
    () =>
      this.capabilityService.canUseModule('billing') &&
      (this.sessionStore.hasPermission('subscription.billing-evidence.submit') ||
        this.sessionStore.hasPermission('subscription.view')),
  );

  // Authoritative status check: true only when backend has returned steps array
  readonly hasAuthoritativeSteps = computed(() => {
    const p = this.progress();
    return p !== null && Array.isArray(p.steps);
  });

  // Summary counts derived strictly from the complete loaded steps list
  readonly summaryCounts = computed(() => {
    const steps = this.progress()?.steps ?? [];
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let blocked = 0;

    for (const step of steps) {
      const norm = normalizeSetupStatus(step.status);
      if (norm === 'complete') {
        completed++;
      } else if (norm === 'in_progress') {
        inProgress++;
      } else if (norm === 'blocked') {
        blocked++;
      } else {
        notStarted++;
      }
    }

    return {
      total: steps.length,
      completed,
      inProgress,
      notStarted,
      blocked,
    };
  });

  // Filtered steps based on search term and status filter
  readonly filteredSteps = computed(() => {
    const steps = this.progress()?.steps ?? [];
    const query = this.searchEnabled() ? this.searchTerm().trim().toLowerCase() : '';
    const filter = this.statusFilterEnabled() ? this.statusFilter() : 'all';

    return steps.filter((step) => {
      // Status filter
      if (filter !== 'all') {
        const norm = normalizeSetupStatus(step.status);
        if (norm !== filter) {
          return false;
        }
      }

      // Search query (matches title or friendly description)
      if (query) {
        const title = (step.title || '').toLowerCase();
        const desc = this.stepDescription(step.id).toLowerCase();
        if (!title.includes(query) && !desc.includes(query)) {
          return false;
        }
      }

      return true;
    });
  });

  readonly hasActiveFilters = computed(
    () =>
      (this.searchEnabled() && this.searchTerm().trim() !== '') ||
      (this.statusFilterEnabled() && this.statusFilter() !== 'all'),
  );

  constructor() {
    this.reload();
  }

  reload(forceRefresh = false): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    const request$ = forceRefresh
      ? this.api.getSetupProgress(true)
      : this.api.getSetupProgress();
    request$.subscribe({
      next: (data) => {
        this.progress.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value || '');
  }

  onStatusFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.statusFilter.set(select.value || 'all');
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
  }

  stepDescription(id: string): string {
    return SETUP_STEP_DESCRIPTIONS[id] ?? 'Configure this step for your organization.';
  }

  statusBadge(status: string): { label: string; tone: UiBadgeTone } {
    return setupStatusBadge(status);
  }

  canOpenStep(step: SetupStep): boolean {
    // 1. Step must not be blocked at the domain/backend level
    if (step.status === 'blocked') {
      return false;
    }

    // 2. Tenant context must be active
    if (!this.sessionStore.activeContext()?.organizationId) {
      return false;
    }

    // 3. User must possess the step's view/manage permission
    if (step.permission && !this.sessionStore.hasPermission(step.permission)) {
      return false;
    }

    // 4. Destination routes may require stronger permissions than the progress read.
    const destinationPermission = STEP_DESTINATION_PERMISSIONS[step.href];
    if (destinationPermission && !this.sessionStore.hasPermission(destinationPermission)) {
      return false;
    }

    // 5. Effective destination capability must be enabled
    const capKey = STEP_CAPABILITY_KEYS[step.href];
    if (capKey && !this.capabilityService.canUseModule(capKey)) {
      return false;
    }

    return true;
  }

  private mapError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? 'Unable to load organization setup.';
    }
    return 'Unable to load organization setup.';
  }
}
