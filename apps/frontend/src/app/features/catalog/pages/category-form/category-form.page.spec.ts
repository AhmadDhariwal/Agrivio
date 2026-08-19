import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CategoryFormPage } from './category-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CategoryFormPage', () => {
  let component: CategoryFormPage;
  let fixture: ComponentFixture<CategoryFormPage>;
  let createCategorySpy: ReturnType<typeof vi.fn>;

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
});


