import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ProductPricingPage } from './product-pricing.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ProductPricingPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductPricingPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'product-1' } } },
        },
        {
          provide: CatalogApi,
          useValue: {
            getProduct: () =>
              of({
                id: 'product-1',
                name: 'Urea',
                version: 1,
              }),
            listPrices: () => of([]),
            replacePrices: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<ProductPricingPage> = TestBed.createComponent(ProductPricingPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="product-pricing"]')).toBeTruthy();
  });
});
