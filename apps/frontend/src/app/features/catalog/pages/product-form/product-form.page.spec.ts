import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductFormPage } from './product-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { signal } from '@angular/core';

describe('ProductFormPage', () => {
  let skuEditable: ReturnType<typeof signal<boolean>>;
  let skuVisible: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    skuEditable = signal(true);
    skuVisible = signal(true);
    await TestBed.configureTestingModule({
      imports: [ProductFormPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            listCategories: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCategoryOptions: () => of([]),
            getProduct: () => of(null),
            listPackagingUnits: () => of([]),
            createProduct: () => of({}),
            updateProduct: () => of({}),
            replacePackagingUnits: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canPerformAction: () => true,
            canViewField: (key: string) =>
              key === 'inventory.products.fields.sku' ? skuVisible() : true,
            canEditField: (key: string) =>
              key === 'inventory.products.fields.sku' ? skuEditable() : true,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<ProductFormPage> = TestBed.createComponent(ProductFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-form"]')).toBeTruthy();
  });

  it('hides the SKU field or renders it read-only for an existing product', () => {
    const fixture: ComponentFixture<ProductFormPage> = TestBed.createComponent(ProductFormPage);
    const component = fixture.componentInstance;
    component.productId.set('product-1');
    skuEditable.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-sku"]').readOnly).toBe(true);

    skuVisible.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-sku"]')).toBeFalsy();
  });
});
