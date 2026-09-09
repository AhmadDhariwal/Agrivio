import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
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

describe('PlatformPlansPage', () => {
  let fixture: ComponentFixture<PlatformPlansPage>;
  const api = {
    listPlatformPlans: vi.fn(() => of([starter])),
    createPlatformPlan: vi.fn(() => of({ ...starter, id: 'starter-v2', planVersion: 2 })),
    updatePlatformPlan: vi.fn(() => of(starter)),
    activatePlatformPlan: vi.fn(() => of(starter)),
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
    fixture.detectChanges();
  });

  it('renders inspectable version, prices, limits, status, and reference state', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Starter');
    expect(text).toContain('v1');
    expect(text).toContain('R1-CATALOG-1');
    expect(text).toContain('200 products');
    expect(text).toContain('Referenced');
  });

  it('prefills a new version without hardcoding plan values in the form', () => {
    const page = fixture.componentInstance;
    page.createFrom(starter);
    expect(page.form.getRawValue()).toMatchObject({
      planCode: 'Starter',
      products: 200,
      activeUsers: 2,
      imports: false,
      supportLevelRef: 'standard',
    });
    page.createAndActivate();
    expect(api.createPlatformPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: true,
        limits: expect.objectContaining({ products: 200 }),
        entitlements: expect.objectContaining({ reportsExports: false }),
      }),
    );
  });

  it('does not offer draft editing or deletion for a referenced active version', () => {
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).not.toContain('Edit draft');
    expect(html).not.toContain('Delete');
    expect(html).toContain('Create new version');
    expect(html).toContain('Retire');
  });
});
