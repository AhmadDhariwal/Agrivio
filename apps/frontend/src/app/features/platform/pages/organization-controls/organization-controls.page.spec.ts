import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import { PlatformCapabilityControl } from '../../../capabilities/models/capability.models';
import { OrganizationControlsPage } from './organization-controls.page';

function control(
  key: string,
  moduleKey: 'inventory.products' | 'inventory.categories',
  type: PlatformCapabilityControl['type'],
  label: string,
  policy: Record<string, boolean>,
  options: { override?: Record<string, boolean>; risk?: PlatformCapabilityControl['risk'] } = {},
): PlatformCapabilityControl {
  const override = options.override ?? null;
  return {
    key,
    parentKey: key === moduleKey ? 'inventory' : moduleKey,
    moduleKey,
    type,
    label,
    description: `${label} control`,
    defaultPolicy: policy,
    configurable: Object.fromEntries(Object.keys(policy).map((mode) => [mode, true])),
    risk: options.risk ?? 'NORMAL',
    override,
    configuredValue: { ...policy, ...(override ?? {}) },
    effectiveValue: { ...policy, ...(override ?? {}) },
    reasons: [],
  };
}

describe('OrganizationControlsPage', () => {
  let fixture: ComponentFixture<OrganizationControlsPage>;
  let saved: { expectedVersion: number; changes: readonly unknown[] } | null;
  const resetControl = vi.fn();

  beforeEach(async () => {
    saved = null;
    resetControl.mockReset().mockReturnValue(of({}));
    const controls = [
      control(
        'inventory.products',
        'inventory.products',
        'FEATURE',
        'Products module',
        {
          enabled: true,
        },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.products.widgets.lowStock',
        'inventory.products',
        'WIDGET',
        'Low Stock',
        { visible: true },
        { override: { visible: false } },
      ),
      control('inventory.products.fields.sku', 'inventory.products', 'FIELD', 'SKU', {
        visible: true,
        editable: true,
      }),
      control(
        'inventory.categories',
        'inventory.categories',
        'FEATURE',
        'Categories module',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.categories.widgets.totalCategories',
        'inventory.categories',
        'WIDGET',
        'Total Categories',
        { visible: true },
      ),
    ];
    await TestBed.configureTestingModule({
      imports: [OrganizationControlsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'org-a' } } },
        },
        {
          provide: CapabilitiesApi,
          useValue: {
            getOrganizationPolicy: () =>
              of({
                organization: {
                  id: 'org-a',
                  name: 'Greenfield Agro Center',
                  owner: { email: 'owner@greenfield.test' },
                  subscription: { planCode: 'Business', status: 'active' },
                },
                policy: {
                  version: 4,
                  updatedBy: null,
                  updatedAt: null,
                  operationalAllowed: true,
                  controls,
                },
              }),
            updateOrganizationPolicy: (
              _organizationId: string,
              expectedVersion: number,
              changes: readonly unknown[],
            ) => {
              saved = { expectedVersion, changes };
              return of({});
            },
            resetOrganizationControl: resetControl,
            resetOrganizationModule: () => of({}),
            resetOrganization: () => of({}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationControlsPage);
    fixture.detectChanges();
  });

  it('shows Products and Categories with business-readable policy state and no raw JSON', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Products');
    expect(text).toContain('Categories');
    expect(text).toContain('Organization override');
    expect(text).toContain('— Uses default');
    expect(text).not.toContain('{"enabled"');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('stages a critical change, presents its impact, and saves version-safely', () => {
    const component = fixture.componentInstance;
    const products = component.controls().find((item) => item.key === 'inventory.products');
    if (!products) throw new Error('Expected Products control');
    component.setValue(products, 'enabled', false);

    expect(component.changeSummary()[0]).toMatchObject({
      before: 'Enabled',
      after: 'Disabled',
      risk: 'CRITICAL',
    });
    component.askSave();
    expect(component.confirmationTitle()).toContain('Disable Products module');
    expect(component.confirmationMessage()).toContain('Critical impact');
    component.confirm();

    expect(saved).toMatchObject({ expectedVersion: 4 });
    expect(saved?.changes).toHaveLength(1);
  });

  it('calls the real individual reset API with organization, semantic key, and policy version', () => {
    const component = fixture.componentInstance;
    const lowStock = component.controls().find((item) => item.key.endsWith('lowStock'));
    if (!lowStock) throw new Error('Expected Low Stock control');
    component.askResetControl(lowStock);
    expect(component.confirmationTitle()).toContain('Reset “Low Stock”');
    component.confirm();

    expect(resetControl).toHaveBeenCalledWith('org-a', lowStock.key, 4, '');
  });
});
