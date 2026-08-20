import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import { PlatformCapabilityControl } from '../../../capabilities/models/capability.models';
import { OrganizationControlsPage } from './organization-controls.page';

function control(
  key: string,
  moduleKey:
    'inventory.products' | 'inventory.categories' | 'inventory.stock' | 'inventory.openingStock',
  type: PlatformCapabilityControl['type'],
  label: string,
  policy: Record<string, boolean>,
  options: {
    override?: Record<string, boolean>;
    risk?: PlatformCapabilityControl['risk'];
    configurable?: Record<string, boolean>;
    platformEnforced?: boolean;
    reason?: string;
  } = {},
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
    configurable:
      options.configurable ?? Object.fromEntries(Object.keys(policy).map((mode) => [mode, true])),
    risk: options.risk ?? 'NORMAL',
    override,
    configuredValue: { ...policy, ...(override ?? {}) },
    effectiveValue: { ...policy, ...(override ?? {}) },
    reasons: [],
    ...(options.platformEnforced ? { platformEnforced: true } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

describe('OrganizationControlsPage', () => {
  let fixture: ComponentFixture<OrganizationControlsPage>;
  let saved: { expectedVersion: number; changes: readonly unknown[] } | null;
  const resetControl = vi.fn();
  const resetModule = vi.fn();

  beforeEach(async () => {
    saved = null;
    resetControl.mockReset().mockReturnValue(of({}));
    resetModule.mockReset().mockReturnValue(of({}));
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
      control(
        'inventory.openingStock',
        'inventory.openingStock',
        'FEATURE',
        'Opening Stock',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.openingStock.features.moduleInfo',
        'inventory.openingStock',
        'FEATURE',
        'Module Information',
        { enabled: true },
      ),
      control(
        'inventory.openingStock.fields.packagingUnit',
        'inventory.openingStock',
        'FIELD',
        'Packaging Unit',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.openingStock.fields.warehouse',
        'inventory.openingStock',
        'FIELD',
        'Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Opening Stock must identify the destination warehouse.',
        },
      ),
      control(
        'inventory.openingStock.fields.batchExpiry',
        'inventory.openingStock',
        'FIELD',
        'Batch / Expiry',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Selected product tracking rules remain authoritative.',
        },
      ),
      control(
        'inventory.openingStock.actions.post',
        'inventory.openingStock',
        'ACTION',
        'Post Opening Stock',
        { allowed: true },
        { risk: 'CRITICAL' },
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
      control(
        'inventory.stock',
        'inventory.stock',
        'FEATURE',
        'Stock on Hand',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.stock.fields.wac',
        'inventory.stock',
        'FIELD',
        'Weighted Average Cost (WAC)',
        { visible: true },
      ),
      control(
        'inventory.stock.widgets.stockRecords',
        'inventory.stock',
        'WIDGET',
        'Stock Records',
        { visible: true },
        { override: { visible: false } },
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
            resetOrganizationModule: resetModule,
            resetOrganization: () => of({}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationControlsPage);
    fixture.detectChanges();
  });

  it('shows all registered modules with business-readable policy state and no raw JSON', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Products');
    expect(text).toContain('Categories');
    expect(text).toContain('Inventory / Stock on Hand');
    expect(text).toContain('Opening Stock');
    expect(text).toContain('Organization override');
    expect(text).toContain('— Uses default');
    expect(text).not.toContain('{"enabled"');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('renders Opening Stock optional and required controls through the shared renderer', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Opening Stock Module');
    expect(text).toContain('Optional UI');
    expect(text).toContain('Optional Fields');
    expect(text).toContain('Required Workflow Fields');
    expect(text).toContain('Warehouse');
    expect(text).toContain('Requirement');
    expect(text).toContain('Required');
    expect(text).toContain('Control');
    expect(text).toContain('Platform enforced');
    expect(text).toContain('Opening Stock must identify the destination warehouse.');
    expect(text).toContain('Batch / Expiry');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('uses the required critical confirmation when disabling Opening Stock', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    const module = component.controls().find((item) => item.key === 'inventory.openingStock');
    if (!module) throw new Error('Expected Opening Stock control');
    component.setValue(module, 'enabled', false);
    component.askSave();

    expect(component.confirmationTitle()).toBe('Disable Opening Stock for Greenfield Agro Center?');
    expect(component.confirmationMessage()).toContain(
      'Users in this organization will no longer be able to access or post Opening Stock.',
    );
    expect(component.confirmationMessage()).toContain(
      'Existing stock and historical transactions will not be changed.',
    );
    expect(component.confirmationLabel()).toBe('Disable Opening Stock');
  });

  it('uses the shared renderer for Inventory controls and stages WAC visibility', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.stock');
    fixture.detectChanges();

    const wac = component.controls().find((item) => item.key === 'inventory.stock.fields.wac');
    if (!wac) throw new Error('Expected WAC control');
    component.setValue(wac, 'visible', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Weighted Average Cost (WAC)');
    expect(component.changeSummary()).toContainEqual(
      expect.objectContaining({ label: 'Weighted Average Cost (WAC)', after: 'Hidden' }),
    );
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

  it('calls the shared module reset API with the semantic Stock-on-Hand module key', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.stock');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.stock', 4, '');
  });

  it('calls the shared module reset API with only the Opening Stock namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.openingStock', 4, '');
  });
});
