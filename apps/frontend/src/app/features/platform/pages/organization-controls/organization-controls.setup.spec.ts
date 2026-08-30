import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import { PlatformCapabilityControl } from '../../../capabilities/models/capability.models';
import { OrganizationControlsPage } from './organization-controls.page';

function control(
  key: string,
  type: PlatformCapabilityControl['type'],
  policy: Record<string, boolean>,
  override: Record<string, boolean> | null = null,
): PlatformCapabilityControl {
  return {
    key,
    parentKey: key === 'setup' ? null : 'setup',
    moduleKey: 'setup',
    type,
    label: key,
    description: key,
    defaultPolicy: policy,
    configurable: Object.fromEntries(Object.keys(policy).map((mode) => [mode, true])),
    risk: key === 'setup' ? 'CRITICAL' : 'NORMAL',
    override,
    configuredValue: { ...policy, ...(override ?? {}) },
    effectiveValue: { ...policy, ...(override ?? {}) },
    reasons: [],
  };
}

describe('Organization Controls Setup registry', () => {
  let fixture: ComponentFixture<OrganizationControlsPage>;
  const resetModule = vi.fn();

  beforeEach(async () => {
    const controls = [
      control('setup', 'MODULE', { enabled: true }),
      ...[
        'moduleInfo',
        'summary',
        'subscriptionNotice',
        'search',
        'statusFilter',
        'taskList',
        'operationalReadiness',
        'notes',
      ].map((id) =>
        control(
          `setup.features.${id}`,
          'FEATURE',
          { enabled: true },
          id === 'notes' ? { enabled: false } : null,
        ),
      ),
      control('setup.actions.refresh', 'ACTION', { allowed: true }),
    ];
    const snapshot = {
      organization: { id: 'org-a', name: 'Tenant A' },
      policy: { organizationId: 'org-a', version: 1, controls },
    };
    resetModule.mockReturnValue(of(snapshot));

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
            getOrganizationPolicy: () => of(snapshot),
            resetOrganizationModule: resetModule,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OrganizationControlsPage);
    fixture.detectChanges();
  });

  it('renders all Setup metadata in the generic renderer', () => {
    const component = fixture.componentInstance;
    component.selectModule('setup');
    fixture.detectChanges();

    expect(component.selectedControls()).toHaveLength(10);
    expect(component.moduleInfoControls()).toHaveLength(1);
    expect(component.presentationFeatureControls()).toHaveLength(5);
    expect(component.filterControls()).toHaveLength(2);
    expect(component.actionControls()).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Refresh Setup Progress');
  });

  it('uses the generic critical confirmation and module reset', () => {
    const component = fixture.componentInstance;
    component.selectModule('setup');
    const moduleControl = component.controls().find((item) => item.key === 'setup');
    expect(moduleControl).toBeDefined();
    component.setValue(moduleControl!, 'enabled', false);
    expect(component.disablingSetup()).toBe(true);
    expect(component.confirmationMessage()).toContain('completion facts');

    component.setValue(moduleControl!, 'enabled', true);
    component.askResetModule();
    component.confirm();
    expect(resetModule).toHaveBeenCalledWith('org-a', 'setup', 1, '');
  });
});
