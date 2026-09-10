import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformPlansPage } from './plans-admin.page';
import {
  SubscriptionApi,
  SubscriptionPlanSummary,
} from '../../../subscriptions/data-access/subscription.api';

const starter: SubscriptionPlanSummary = {
  id: 'starter-v1',
  planCode: 'Starter',
  planVersion: 1,
  status: 'active',
  currency: 'PKR',
  displayName: 'Starter',
  shortDescription: 'Essential POS and inventory.',
  targetCustomer: 'Single-shop agricultural retailer',
  catalogRevision: 'R1-CATALOG-1',
  monthlyPriceMinorUnits: 500000,
  annualPriceMinorUnits: 5000000,
  annualDiscountPercent: 16.67,
  annualSavingsMinorUnits: 1000000,
  trialEligible: true,
  referencedAt: '2026-09-01T00:00:00.000Z',
  referenced: true,
  selectable: true,
  version: 2,
  limits: {
    products: 200,
    activeUsers: 2,
    branches: 1,
    warehouses: 1,
    customers: 100,
    suppliers: 50,
  },
  entitlements: {
    imports: false,
    reportsExports: false,
    auditHistory: '30d',
    backupPolicyRef: 'weekly',
    dedicatedCloudEligible: false,
    supportLevelRef: 'standard',
  },
};

const businessDraft: SubscriptionPlanSummary = {
  id: 'business-v1',
  planCode: 'Business',
  planVersion: 1,
  status: 'draft',
  currency: 'PKR',
  displayName: 'Business',
  shortDescription: 'Growing dealer capacity.',
  targetCustomer: 'Growing dealer or wholesaler',
  catalogRevision: 'R1-CATALOG-1',
  monthlyPriceMinorUnits: 1500000,
  annualPriceMinorUnits: 15000000,
  annualDiscountPercent: 16.67,
  annualSavingsMinorUnits: 3000000,
  trialEligible: true,
  referencedAt: null,
  referenced: false,
  selectable: true,
  version: 1,
  limits: {
    products: 2000,
    activeUsers: 15,
    branches: 5,
    warehouses: 10,
    customers: 1000,
    suppliers: 500,
  },
  entitlements: {
    imports: true,
    reportsExports: true,
    auditHistory: '90d',
    backupPolicyRef: 'daily',
    dedicatedCloudEligible: false,
    supportLevelRef: 'business',
  },
};

describe('PlatformPlansPage', () => {
  let fixture: ComponentFixture<PlatformPlansPage>;
  let page: PlatformPlansPage;
  const api = {
    listPlatformPlans: vi.fn(() => of([starter])),
    createPlatformPlan: vi.fn(() => of({ ...starter, id: 'starter-v2', planVersion: 2 })),
    updatePlatformPlan: vi.fn(() => of(businessDraft)),
    activatePlatformPlan: vi.fn(() => of({ ...businessDraft, status: 'active' })),
    retirePlatformPlan: vi.fn(() => of({ ...starter, status: 'superseded' })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    api.listPlatformPlans.mockReturnValue(of([starter]));
    await TestBed.configureTestingModule({
      imports: [PlatformPlansPage],
      providers: [{ provide: SubscriptionApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(PlatformPlansPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders inspectable version, prices, limits, status, and reference state', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Starter');
    expect(text).toContain('v1');
    expect(text).toContain('R1-CATALOG-1');
    expect(text).toContain('200 products');
    expect(text).toContain('Referenced');
    expect(text).toContain('Pinned');
  });

  it('inspect(plan) opens read-only detail drawer and does not open editor', () => {
    page.inspect(starter);
    fixture.detectChanges();

    const inspector = fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]');
    const editor = fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]');

    expect(inspector).toBeTruthy();
    expect(editor).toBeNull();
    expect(inspector.textContent).toContain('Starter v1');
    expect(inspector.textContent).toContain('Plan Lifecycle & Reference');
    expect(inspector.textContent).toContain('200 products');
    expect(inspector.textContent).toContain('Yes (Immutable / Pinned)');
  });

  it('createFrom(plan) opens version editor, not Inspect, and prefills from source plan', () => {
    page.createFrom(starter);
    fixture.detectChanges();

    const inspector = fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]');
    const editor = fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]');

    expect(editor).toBeTruthy();
    expect(inspector).toBeNull();
    expect(page.editorOpen()).toBe(true);
    expect(page.inspectedPlan()).toBeNull();
    expect(page.editingDraft()).toBe(false);
    expect(page.targetPlan()).toBe(starter);

    expect(page.form.getRawValue()).toMatchObject({
      planCode: 'Starter',
      displayName: 'Starter',
      products: 200,
      activeUsers: 2,
      imports: false,
      supportLevelRef: 'standard',
    });

    const notice = fixture.nativeElement.querySelector('[data-testid="version-creation-notice"]');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain('Creating next plan version');
    expect(notice.textContent).toContain('remains immutable and all active subscriptions stay pinned');
  });

  it('submitting new version calls createPlatformPlan with activate flag', () => {
    page.createFrom(starter);
    page.createAndActivate();

    expect(api.createPlatformPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        planCode: 'Starter',
        activate: true,
        limits: expect.objectContaining({ products: 200 }),
        entitlements: expect.objectContaining({ reportsExports: false }),
      }),
    );
    expect(page.successMessage()).toBe('Created Starter plan version');
  });

  it('clicking Create New Version action button does NOT invoke inspect()', () => {
    const inspectSpy = vi.spyOn(page, 'inspect');
    const createBtn = fixture.nativeElement.querySelector(
      '[data-testid="create-version-btn"]',
    ) as HTMLButtonElement;

    createBtn.click();
    fixture.detectChanges();

    expect(inspectSpy).not.toHaveBeenCalled();
    expect(page.inspectedPlan()).toBeNull();
    expect(page.editorOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]')).toBeTruthy();
  });

  it('enforces invariant: inspector, editor, and retire dialog are mutually exclusive', () => {
    // 1. Initially none open
    expect(page.inspectedPlan()).toBeNull();
    expect(page.editorOpen()).toBe(false);
    expect(page.retireConfirmOpen()).toBe(false);

    // 2. Open inspector
    page.inspect(starter);
    fixture.detectChanges();
    expect(page.inspectedPlan()).toBe(starter);
    expect(page.editorOpen()).toBe(false);
    expect(page.retireConfirmOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]')).toBeNull();

    // 3. Open editor -> inspector closes immediately
    page.createFrom(starter);
    fixture.detectChanges();
    expect(page.inspectedPlan()).toBeNull();
    expect(page.editorOpen()).toBe(true);
    expect(page.retireConfirmOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]')).toBeTruthy();

    // 4. Open retire -> editor closes immediately
    page.retire(starter);
    fixture.detectChanges();
    expect(page.inspectedPlan()).toBeNull();
    expect(page.editorOpen()).toBe(false);
    expect(page.retireConfirmOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-editor-drawer"]')).toBeNull();

    // 5. Open inspector -> retire dialog closes immediately
    page.inspect(starter);
    fixture.detectChanges();
    expect(page.inspectedPlan()).toBe(starter);
    expect(page.editorOpen()).toBe(false);
    expect(page.retireConfirmOpen()).toBe(false);
  });

  it('switching between different plans resets stale form state and prefills newly selected plan only', () => {
    page.createFrom(starter);
    expect(page.form.getRawValue().products).toBe(200);
    expect(page.form.getRawValue().imports).toBe(false);
    expect(page.form.getRawValue().planCode).toBe('Starter');

    page.createFrom(businessDraft);
    expect(page.form.getRawValue().products).toBe(2000);
    expect(page.form.getRawValue().imports).toBe(true);
    expect(page.form.getRawValue().planCode).toBe('Business');
    expect(page.targetPlan()?.id).toBe('business-v1');
  });

  it('closeEditor() resets form and clears state', () => {
    page.createFrom(starter);
    expect(page.editorOpen()).toBe(true);

    page.closeEditor();
    expect(page.editorOpen()).toBe(false);
    expect(page.targetPlan()).toBeNull();
    expect(page.editingDraft()).toBe(false);
    expect(page.form.getRawValue().products).toBeNull();
  });

  it('retire action opens shared confirmation modal, not window.prompt or alert', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const alertSpy = vi.spyOn(window, 'alert');

    page.retire(starter);
    fixture.detectChanges();

    expect(promptSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(page.retireConfirmOpen()).toBe(true);
    expect(page.retiringPlan()).toBe(starter);

    expect(page.retireDialogMessage()).toContain('Starter v1');
    expect(page.retireDialogMessage()).toContain('no longer selectable for new subscriptions');
    expect(page.retireDialogMessage()).toContain('Existing pinned subscriptions remain unaffected');
  });

  it('cancelRetire() does nothing and closes confirmation modal', () => {
    page.retire(starter);
    expect(page.retireConfirmOpen()).toBe(true);

    page.cancelRetire();
    expect(page.retireConfirmOpen()).toBe(false);
    expect(page.retiringPlan()).toBeNull();
    expect(api.retirePlatformPlan).not.toHaveBeenCalled();
  });

  it('confirmRetire ignores empty or whitespace-only reason', () => {
    page.retire(starter);
    page.confirmRetire('   ');

    expect(api.retirePlatformPlan).not.toHaveBeenCalled();
    expect(page.retireConfirmOpen()).toBe(true);
  });

  it('confirmRetire calls existing retire API with trimmed reason', () => {
    page.retire(starter);
    page.confirmRetire('  Commercial catalog sunset  ');

    expect(api.retirePlatformPlan).toHaveBeenCalledWith(starter, 'Commercial catalog sunset');
    expect(page.retireConfirmOpen()).toBe(false);
    expect(page.retiringPlan()).toBeNull();
  });

  it('confirmRetire keeps modal open and sets error state on API failure', () => {
    api.retirePlatformPlan.mockReturnValueOnce(
      throwError(() => ({ error: { message: 'Version conflict occurred' } })),
    );

    page.retire(starter);
    page.confirmRetire('Retirement reason');

    expect(page.retireConfirmOpen()).toBe(true);
    expect(page.retireErrorMessage()).toBe('Version conflict occurred');
    expect(page.retireDialogMessage()).toContain('Version conflict occurred');
    expect(page.retiringInFlight()).toBe(false);
  });

  it('supports unreferenced draft editing and activation while preventing edit on referenced plans', () => {
    // 1. Referenced active version does not offer edit draft
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).not.toContain('Edit draft');
    expect(html).toContain('Create new version');
    expect(html).toContain('Retire');

    // 2. Load draft plan
    api.listPlatformPlans.mockReturnValue(of([businessDraft]));
    page.reload();
    fixture.detectChanges();

    const draftHtml = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(draftHtml).toContain('Edit draft');
    expect(draftHtml).toContain('Activate');

    // 3. Edit draft opens editor in editingDraft mode
    page.editDraft(businessDraft);
    fixture.detectChanges();

    expect(page.editingDraft()).toBe(true);
    expect(page.targetPlan()).toBe(businessDraft);
    expect(page.editorOpen()).toBe(true);

    const draftNotice = fixture.nativeElement.querySelector('[data-testid="draft-edit-notice"]');
    expect(draftNotice).toBeTruthy();
    expect(draftNotice.textContent).toContain('Editing unreferenced draft');

    // 4. Save draft calls updatePlatformPlan and captures edit mode for success message
    page.saveDraft();
    expect(api.updatePlatformPlan).toHaveBeenCalledWith(
      businessDraft,
      expect.objectContaining({
        planCode: 'Business',
        expectedVersion: 1,
      }),
    );
    expect(page.successMessage()).toBe('Updated Business v1');

    // 5. Activate calls activatePlatformPlan
    page.activate(businessDraft);
    expect(api.activatePlatformPlan).toHaveBeenCalledWith(businessDraft);
  });

  it('inspect draft -> activate -> success closes inspector and reloads updated list', () => {
    // 1. Inspect the draft plan
    page.inspect(businessDraft);
    fixture.detectChanges();
    expect(page.inspectedPlan()).toBe(businessDraft);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeTruthy();

    // 2. Prepare activate success with updated plan list
    const activeBusiness = { ...businessDraft, status: 'active' as const };
    api.activatePlatformPlan.mockReturnValueOnce(of(activeBusiness));
    api.listPlatformPlans.mockReturnValueOnce(of([starter, activeBusiness]));

    // 3. Activate the draft
    page.activate(businessDraft);
    fixture.detectChanges();

    // 4. Inspector must be closed (not showing stale draft state)
    expect(page.inspectedPlan()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="plan-inspector-drawer"]')).toBeNull();

    // 5. Success message set and list refreshed
    expect(page.successMessage()).toBe('Activated Business v1');
    expect(api.listPlatformPlans).toHaveBeenCalled();
  });

  it('renders plan card as non-interactive presentation container without card-level click or button role', () => {
    const card = fixture.nativeElement.querySelector('[data-testid="plan-card"]') as HTMLElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();

    const inspectSpy = vi.spyOn(page, 'inspect');
    card.click();
    fixture.detectChanges();

    expect(inspectSpy).not.toHaveBeenCalled();
    expect(page.inspectedPlan()).toBeNull();
  });
});
