import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import { PlatformCapabilityControl } from '../../../capabilities/models/capability.models';
import { OrganizationControlsPage } from './organization-controls.page';

function control(
  key: string,
  type: PlatformCapabilityControl['type'],
  label: string,
  policy: Record<string, boolean>,
): PlatformCapabilityControl {
  return {
    key,
    parentKey: key === 'inventory.products' ? 'inventory' : 'inventory.products',
    moduleKey: 'inventory.products',
    type,
    label,
    description: `${label} control`,
    defaultPolicy: policy,
    configurable: Object.fromEntries(Object.keys(policy).map((mode) => [mode, true])),
    override: null,
    configuredValue: policy,
    effectiveValue: policy,
    reasons: [],
  };
}

describe('OrganizationControlsPage', () => {
  let fixture: ComponentFixture<OrganizationControlsPage>;
  let saved: { expectedVersion: number; changes: readonly unknown[] } | null;

  beforeEach(async () => {
    saved = null;
    const controls = [
      control('inventory.products', 'FEATURE', 'Products module', { enabled: true }),
      control('inventory.products.widgets.lowStock', 'WIDGET', 'Low Stock', { visible: true }),
      control('inventory.products.fields.sku', 'FIELD', 'SKU', {
        visible: true,
        editable: true,
      }),
      control('inventory.products.actions.managePricing', 'ACTION', 'Manage Pricing', {
        allowed: true,
      }),
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
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationControlsPage);
    fixture.detectChanges();
  });

  it('loads Products controls, stages a widget/field/action diff, and saves version-safely', () => {
    const component = fixture.componentInstance;
    const lowStock = component.controls().find((item) => item.key.endsWith('lowStock'));
    const sku = component.controls().find((item) => item.key.endsWith('.sku'));
    const pricing = component.controls().find((item) => item.key.endsWith('managePricing'));
    if (!lowStock || !sku || !pricing) {
      throw new Error('Expected Product capability controls');
    }

    component.setValue(lowStock, 'visible', false);
    component.setValue(sku, 'editable', false);
    component.setValue(pricing, 'allowed', false);
    expect(component.changes()).toHaveLength(3);
    expect(component.changeSummary().join(' ')).toContain('Read-only');

    component.askSave();
    component.save();
    expect(saved).toMatchObject({ expectedVersion: 4 });
    expect(saved?.changes).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Greenfield Agro Center');
    expect(fixture.nativeElement.textContent).toContain(
      'Changes apply to all users in this organization',
    );
  });
});
