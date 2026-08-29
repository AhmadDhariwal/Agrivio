import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductFormPage } from './product-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { signal } from '@angular/core';

describe('ProductFormPage', () => {
  let skuEditable: ReturnType<typeof signal<boolean>>;
  let skuVisible: ReturnType<typeof signal<boolean>>;
  let searchCategoryOptions: ReturnType<typeof vi.fn>;
  let getCategory: ReturnType<typeof vi.fn>;

  async function waitForFormReady(fixture: ComponentFixture<ProductFormPage>) {
    const deadline = Date.now() + 3000;
    while (fixture.componentInstance.loading() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      fixture.detectChanges();
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function createFixture(routeId: string | null = null) {
    await TestBed.configureTestingModule({
      imports: [ProductFormPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? routeId : null),
              },
            },
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listCategories: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCategoryOptions,
            getCategory,
            getProduct: () =>
              of({
                id: 'prod-1',
                organizationId: 'org-1',
                categoryId: 'cat-9',
                name: 'Legacy Seed',
                sku: 'SEED-1',
                trackingMode: 'batch',
                baseUnitCode: 'KG',
                measurementDimension: 'mass',
                status: 'active',
                version: 1,
              }),
            listPackagingUnits: () => of([]),
            createProduct: vi.fn(() => of({ id: 'new-prod', version: 1 })),
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

    const fixture = TestBed.createComponent(ProductFormPage);
    fixture.detectChanges();
    await waitForFormReady(fixture);
    return fixture;
  }

  beforeEach(() => {
    skuEditable = signal(true);
    skuVisible = signal(true);
    searchCategoryOptions = vi.fn(() =>
      of([
        {
          id: 'cat-1',
          organizationId: 'org-1',
          name: 'Fertilizers',
          productClass: 'fertilizer',
          status: 'active',
          version: 1,
        },
      ]),
    );
    getCategory = vi.fn(() =>
      of({
        id: 'cat-9',
        organizationId: 'org-1',
        name: 'Archived Seeds',
        productClass: 'seed',
        status: 'inactive',
        version: 1,
      }),
    );
  });

  it('renders create form', async () => {
    const fixture = await createFixture();
    expect(fixture.nativeElement.querySelector('[data-testid="product-form"]')).toBeTruthy();
    expect(searchCategoryOptions).toHaveBeenCalledWith('');
  });

  it('hydrates the selected category on edit even when it is outside the first search page', async () => {
    searchCategoryOptions.mockReturnValue(
      of([
        {
          id: 'cat-1',
          organizationId: 'org-1',
          name: 'Fertilizers',
          productClass: 'fertilizer',
          status: 'active',
          version: 1,
        },
      ]),
    );

    const fixture = await createFixture('prod-1');

    expect(getCategory).toHaveBeenCalledWith('cat-9');
    const select = fixture.nativeElement.querySelector(
      '[data-testid="product-category"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe('cat-9');
    expect(fixture.nativeElement.textContent).toContain('Archived Seeds');
  });

  it('hides the SKU field or renders it read-only for an existing product', async () => {
    const fixture = await createFixture('prod-1');

    skuEditable.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-sku"]').readOnly).toBe(true);

    skuVisible.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-sku"]')).toBeFalsy();
  });

  it('disables save while required fields are missing', async () => {
    const fixture = await createFixture();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="product-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks invalid submit without calling createProduct', async () => {
    const createProduct = vi.fn(() => of({ id: 'new-prod', version: 1 }));
    await TestBed.configureTestingModule({
      imports: [ProductFormPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? null : null),
              },
            },
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            searchCategoryOptions,
            getCategory,
            getProduct: () => of({}),
            listPackagingUnits: () => of([]),
            createProduct,
            updateProduct: () => of({}),
            replacePackagingUnits: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canPerformAction: () => true,
            canViewField: () => true,
            canEditField: () => true,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProductFormPage);
    fixture.detectChanges();
    await waitForFormReady(fixture);

    const page = fixture.componentInstance;
    page.save();
    fixture.detectChanges();

    expect(createProduct).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Category is required.');
  });
});
