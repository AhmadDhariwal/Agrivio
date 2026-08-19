import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductFormPage } from './product-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ProductFormPage', () => {
  beforeEach(async () => {
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
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<ProductFormPage> = TestBed.createComponent(ProductFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-form"]')).toBeTruthy();
  });
});
