import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CategoryFormPage } from './category-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('CategoryFormPage', () => {
  let component: CategoryFormPage;
  let fixture: ComponentFixture<CategoryFormPage>;
  let createCategorySpy: ReturnType<typeof vi.fn>;
  let capabilityState: ReturnType<typeof signal<Record<string, Record<string, boolean>>>>;

  beforeEach(async () => {
    createCategorySpy = vi.fn().mockReturnValue(
      of({
        id: 'cat-new',
        organizationId: 'org-1',
        name: 'Organic Fertilizers',
        productClass: 'fertilizer',
        status: 'active',
        version: 1,
      }),
    );
    capabilityState = signal({});
    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;

    await TestBed.configureTestingModule({
      imports: [CategoryFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: CatalogApi,
          useValue: {
            getCategory: () => of(null),
            createCategory: createCategorySpy,
            updateCategory: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseView: (key: string) => capabilityValue(key, 'enabled'),
            canViewField: (key: string) => capabilityValue(key, 'visible'),
            canEditField: (key: string) => capabilityValue(key, 'editable'),
            canPerformAction: (key: string) => capabilityValue(key, 'allowed'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryFormPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders create form with Basic Information and Inventory Behavior cards', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="category-form"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Basic Information');
    expect(fixture.nativeElement.textContent).toContain('Inventory & Regulatory Policy');
    expect(fixture.nativeElement.textContent).toContain('Tracking Requirement');
  });

  it('updates derived tracking requirement when product class changes', () => {
    component.form.controls.productClass.setValue('fertilizer');
    fixture.detectChanges();

    expect(component.getTrackingRequirement('fertilizer')).toBe('Batch required');
    expect(fixture.nativeElement.textContent).toContain('Mandatory Batch Tracking');

    component.form.controls.productClass.setValue('general');
    fixture.detectChanges();

    expect(component.getTrackingRequirement('general')).toBe('Standard');
    expect(fixture.nativeElement.textContent).toContain('Flexible Tracking Modes');
  });

  it('submits valid category form', () => {
    component.form.controls.name.setValue('Organic Fertilizers');
    component.form.controls.productClass.setValue('fertilizer');

    component.save();

    expect(createCategorySpy).toHaveBeenCalledWith({
      name: 'Organic Fertilizers',
      productClass: 'fertilizer',
    });
  });

  it('renders configured Category fields read-only on edit and hides derived tracking UI', () => {
    component.categoryId.set('cat-1');
    capabilityState.set({
      'inventory.categories.fields.name': { visible: true, editable: false },
      'inventory.categories.fields.productClass': { visible: true, editable: false },
      'inventory.categories.fields.status': { visible: false, editable: false },
      'inventory.categories.features.trackingRequirementDisplay': { enabled: false },
    });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector('[data-testid="category-name"]') as HTMLInputElement)
        .readOnly,
    ).toBe(true);
    expect(
      (
        fixture.nativeElement.querySelector(
          '[data-testid="category-product-class"]',
        ) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Inventory & Regulatory Policy');
    expect(fixture.nativeElement.querySelector('[data-testid="category-status"]')).toBeNull();
  });
});
