import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BillingRecordSummary,
  PlatformBillingQuery,
  PlatformBillingRecordDetail,
  SubscriptionApi,
} from '../../../subscriptions/data-access/subscription.api';
import {
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from '../../data-access/platform-organizations.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';

type BillingStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | '';
type PendingApprove = { kind: 'approve'; item: BillingRecordSummary };
type PendingReject = { kind: 'reject'; item: BillingRecordSummary };

@Component({
  selector: 'agrivio-platform-billing-review-page',
  standalone: true,
  imports: [UiAlertComponent, UiEmptyStateComponent, UiLoadingStateComponent, UiPaginationComponent],
  templateUrl: './billing-review.page.html',
  styleUrl: './billing-review.page.scss',
})
export class PlatformBillingReviewPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly organizationsApi = inject(PlatformOrganizationsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<boolean>();
  private readonly searchChanges = new Subject<string>();
  private objectUrls: string[] = [];

  readonly items = signal<BillingRecordSummary[]>([]);
  readonly organizations = signal<PlatformOrganizationSummary[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(true);
  readonly actionInProgress = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly search = signal('');
  readonly statusFilter = signal<BillingStatus>('');
  readonly organizationFilter = signal('');

  readonly isMobile = signal(false);
  readonly mobileFiltersOpen = signal(false);

  readonly selectedId = signal<string | null>(null);
  readonly inspectorDetail = signal<PlatformBillingRecordDetail | null>(null);
  readonly inspectorLoading = signal(false);
  readonly inspectorError = signal<string | null>(null);
  readonly evidenceBusy = signal(false);

  readonly approveOpen = signal(false);
  readonly rejectOpen = signal(false);
  readonly rejectReason = signal('');
  readonly rejectTouched = signal(false);
  private pending: PendingApprove | PendingReject | null = null;

  readonly canVerify = computed(() => this.sessionStore.hasPermission('platform.billing.verify'));
  readonly organizationsMap = computed(() => {
    const map = new Map<string, PlatformOrganizationSummary>();
    for (const org of this.organizations()) {
      map.set(org.id, org);
    }
    return map;
  });

  readonly hasActiveFilters = computed(
    () => Boolean(this.search() || this.statusFilter() || this.organizationFilter()),
  );

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.statusFilter()) {
      count += 1;
    }
    if (this.organizationFilter()) {
      count += 1;
    }
    return count;
  });

  readonly selectedListItem = computed(() => {
    const id = this.selectedId();
    if (!id) {
      return null;
    }
    return this.items().find((item) => item.id === id) ?? this.inspectorDetail();
  });

  constructor() {
    this.updateMobileState();
    this.organizationsApi.list({ page: 1, pageSize: 100 }).subscribe({
      next: (page) => this.organizations.set(page.items),
      error: () => this.organizations.set([]),
    });

    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => {
        this.search.set(search.trim());
        this.page.set(1);
        this.reload();
      });

    this.destroyRef.onDestroy(() => this.revokeObjectUrls());

    this.reloadRequests
      .pipe(
        startWith(false),
        switchMap((forceRefresh) => {
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.subscriptionApi.listPlatformBillingRecords(this.queueQuery(), forceRefresh).pipe(
            catchError((error: unknown) => {
              this.loading.set(false);
              this.errorMessage.set(this.readError(error, 'Unable to load billing review queue.'));
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        if (page === null) {
          return;
        }
        this.items.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateMobileState();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
      return;
    }
    if (this.approveOpen() || this.rejectOpen()) {
      this.closeDialogs();
      return;
    }
    if (this.selectedId()) {
      this.closeInspector();
    }
  }

  actionsDisabled(): boolean {
    return this.loading() || this.actionInProgress() || !this.canVerify();
  }

  canInspect(): boolean {
    return this.canVerify();
  }

  canStartReview(item: BillingRecordSummary): boolean {
    return this.canVerify() && item.status === 'submitted';
  }

  canApprove(item: BillingRecordSummary): boolean {
    return this.canVerify() && (item.status === 'submitted' || item.status === 'under_review');
  }

  canReject(item: BillingRecordSummary): boolean {
    return this.canApprove(item);
  }

  hasRowActions(item: BillingRecordSummary): boolean {
    return this.canInspect() || this.canStartReview(item) || this.canApprove(item) || this.canReject(item);
  }

  isRejectReasonValid(): boolean {
    return this.rejectReason().trim().length >= 3;
  }

  showRejectReasonError(): boolean {
    return this.rejectTouched() && !this.isRejectReasonValid();
  }

  organizationName(organizationId: string): string {
    return this.organizationsMap().get(organizationId)?.name || 'Unknown organization';
  }

  formatPlan(item: BillingRecordSummary): string {
    return `${item.requestedPlanCode} v${item.requestedPlanVersion}`;
  }

  formatPeriod(period: string): string {
    if (period === 'annual') {
      return 'Annual';
    }
    if (period === 'monthly') {
      return 'Monthly';
    }
    return period;
  }

  formatAmount(item: BillingRecordSummary): string {
    const major = Number(item.submittedAmountMinorUnits) / 100;
    const formatted = Number.isFinite(major)
      ? major.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(item.submittedAmountMinorUnits);
    return `${item.currency} ${formatted}`;
  }

  formatListedAmount(item: BillingRecordSummary): string | null {
    const minor =
      item.billingPeriod === 'annual'
        ? item.listedAnnualPriceMinorUnits
        : item.listedMonthlyPriceMinorUnits;
    if (minor === null || minor === undefined) {
      return null;
    }
    return this.formatAmount({ ...item, submittedAmountMinorUnits: minor });
  }

  formatPaymentMethod(method: string): string {
    if (method === 'bank_transfer') {
      return 'Bank transfer';
    }
    if (method === 'jazzcash') {
      return 'JazzCash';
    }
    if (method === 'easypaisa') {
      return 'Easypaisa';
    }
    return method;
  }

  formatStatus(status: string): string {
    if (status === 'under_review') {
      return 'Under review';
    }
    if (status === 'submitted') {
      return 'Submitted';
    }
    if (status === 'approved') {
      return 'Approved';
    }
    if (status === 'rejected') {
      return 'Rejected';
    }
    return status;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatBytes(size: number | null | undefined): string {
    if (size === null || size === undefined || !Number.isFinite(size)) {
      return '—';
    }
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  displayOrDash(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    return String(value);
  }

  reviewerLabel(item: BillingRecordSummary): string {
    if (!item.reviewedBy) {
      return '—';
    }
    return 'Platform reviewer';
  }

  appliedResult(item: BillingRecordSummary): string {
    if (!item.appliedAt) {
      return 'Not applied';
    }
    const start = this.formatDate(item.coverageStart);
    const end = this.formatDate(item.coverageEnd);
    if (start === '—' && end === '—') {
      return `Applied ${this.formatDateTime(item.appliedAt)}`;
    }
    return `${start} → ${end}`;
  }

  hasCurrentSubscriptionDetail(item: PlatformBillingRecordDetail): boolean {
    return Object.prototype.hasOwnProperty.call(item, 'currentSubscription');
  }

  currentSubscriptionLabel(item: PlatformBillingRecordDetail): string {
    const subscription = item.currentSubscription;
    if (subscription === null) {
      return 'No active subscription';
    }
    if (subscription === undefined) {
      return '—';
    }
    const period = subscription.billingPeriod
      ? this.formatPeriod(subscription.billingPeriod)
      : '—';
    return `${subscription.planCode} v${subscription.planVersion} · ${period} · ${this.formatStatus(subscription.status)}`;
  }

  appliedSubscriptionLabel(item: PlatformBillingRecordDetail): string {
    const applied = item.appliedSubscription;
    if (applied) {
      const plan = `${applied.planCode} v${applied.planVersion} · ${this.formatPeriod(applied.billingPeriod)}`;
      const start = this.formatDate(applied.coverageStart);
      const end = this.formatDate(applied.coverageEnd);
      if (start === '—' && end === '—') {
        return applied.appliedAt
          ? `${plan} · Applied ${this.formatDateTime(applied.appliedAt)}`
          : plan;
      }
      return `${plan} · ${start} → ${end}`;
    }
    return this.appliedResult(item);
  }

  statusClass(status: string): string {
    if (status === 'approved') {
      return 'status-indicator--active';
    }
    if (status === 'rejected') {
      return 'status-indicator--inactive';
    }
    if (status === 'under_review') {
      return 'status-indicator--review';
    }
    return 'status-indicator--submitted';
  }

  reload(forceRefresh = false): void {
    this.reloadRequests.next(forceRefresh);
  }

  refresh(): void {
    this.reload(true);
  }

  retry(): void {
    this.reload(true);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target) {
      this.searchChanges.next(target.value);
    }
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.statusFilter.set((target?.value ?? '') as BillingStatus);
    this.page.set(1);
    this.reload();
  }

  onOrganizationChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.organizationFilter.set(target?.value ?? '');
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.organizationFilter.set('');
    this.page.set(1);
    this.reload();
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  openInspector(item: BillingRecordSummary): void {
    if (!this.canInspect()) {
      return;
    }
    this.selectedId.set(item.id);
    this.inspectorDetail.set(null);
    this.inspectorError.set(null);
    this.inspectorLoading.set(true);
    this.subscriptionApi.getPlatformBillingRecord(item.id).subscribe({
      next: (detail) => {
        if (this.selectedId() !== item.id) {
          return;
        }
        this.inspectorDetail.set(detail);
        this.inspectorLoading.set(false);
      },
      error: (error: unknown) => {
        if (this.selectedId() !== item.id) {
          return;
        }
        this.inspectorLoading.set(false);
        this.inspectorError.set(this.readError(error, 'Unable to load billing record.'));
      },
    });
  }

  retryInspector(): void {
    const item = this.selectedListItem();
    if (item) {
      this.openInspector(item);
    }
  }

  closeInspector(): void {
    this.selectedId.set(null);
    this.inspectorDetail.set(null);
    this.inspectorError.set(null);
    this.revokeObjectUrls();
  }

  startReview(item: BillingRecordSummary): void {
    if (!this.canStartReview(item) || this.actionsDisabled()) {
      return;
    }
    this.runMutation(
      () => this.subscriptionApi.startBillingReview(item.id, item.version),
      'Review started.',
      'Start review failed.',
    );
  }

  askApprove(item: BillingRecordSummary): void {
    if (!this.canApprove(item) || this.actionsDisabled()) {
      return;
    }
    this.pending = { kind: 'approve', item };
    this.rejectOpen.set(false);
    this.approveOpen.set(true);
  }

  confirmApprove(): void {
    const pending = this.pending;
    this.approveOpen.set(false);
    this.pending = null;
    if (!pending || pending.kind !== 'approve' || this.actionsDisabled()) {
      return;
    }
    this.runMutation(
      () => this.subscriptionApi.approveBilling(pending.item.id, pending.item.version),
      'Billing evidence approved.',
      'Approve failed.',
    );
  }

  askReject(item: BillingRecordSummary): void {
    if (!this.canReject(item) || this.actionsDisabled()) {
      return;
    }
    this.pending = { kind: 'reject', item };
    this.rejectReason.set('');
    this.rejectTouched.set(false);
    this.approveOpen.set(false);
    this.rejectOpen.set(true);
  }

  onRejectReasonInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.rejectReason.set(target?.value ?? '');
  }

  confirmReject(): void {
    this.rejectTouched.set(true);
    const pending = this.pending;
    if (!pending || pending.kind !== 'reject') {
      return;
    }
    if (!this.isRejectReasonValid() || this.actionsDisabled()) {
      return;
    }
    const reason = this.rejectReason().trim();
    this.rejectOpen.set(false);
    this.pending = null;
    this.runMutation(
      () => this.subscriptionApi.rejectBilling(pending.item.id, pending.item.version, reason),
      'Billing evidence rejected.',
      'Reject failed.',
    );
  }

  closeDialogs(): void {
    this.approveOpen.set(false);
    this.rejectOpen.set(false);
    this.pending = null;
  }

  pendingItem(): BillingRecordSummary | null {
    return this.pending?.item ?? null;
  }

  viewEvidence(item: BillingRecordSummary): void {
    this.fetchEvidence(item, 'view');
  }

  downloadEvidence(item: BillingRecordSummary): void {
    this.fetchEvidence(item, 'download');
  }

  private fetchEvidence(item: BillingRecordSummary, mode: 'view' | 'download'): void {
    if (this.evidenceBusy()) {
      return;
    }
    this.evidenceBusy.set(true);
    this.subscriptionApi.downloadPlatformEvidence(item.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        if (mode === 'download') {
          const link = document.createElement('a');
          link.href = url;
          link.download = item.evidenceOriginalFileName || 'billing-evidence';
          link.click();
          this.revokeObjectUrl(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        this.evidenceBusy.set(false);
      },
      error: () => {
        this.evidenceBusy.set(false);
        this.errorMessage.set('Unable to download billing evidence.');
      },
    });
  }

  private queueQuery(): PlatformBillingQuery {
    const q = this.search().trim();
    const status = this.statusFilter();
    const organizationId = this.organizationFilter();
    return {
      ...(status ? { status } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(q ? { q } : {}),
      limit: this.pageSize(),
      offset: (this.page() - 1) * this.pageSize(),
    };
  }

  private runMutation(
    request: () => ReturnType<SubscriptionApi['approveBilling']>,
    success: string,
    failure: string,
  ): void {
    if (this.actionInProgress()) {
      return;
    }
    this.errorMessage.set(null);
    this.actionInProgress.set(true);
    request().subscribe({
      next: (updated) => {
        this.actionInProgress.set(false);
        this.successMessage.set(success);
        if (this.selectedId() === updated.id) {
          this.inspectorDetail.set(updated);
        }
        this.reload();
      },
      error: (error: unknown) => {
        this.actionInProgress.set(false);
        this.errorMessage.set(this.readError(error, failure));
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error?.message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    return fallback;
  }

  private updateMobileState(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  private revokeObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
    this.objectUrls = this.objectUrls.filter((item) => item !== url);
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
  }
}
