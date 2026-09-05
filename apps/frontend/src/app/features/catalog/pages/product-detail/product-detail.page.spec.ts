import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProductDetailPage } from './product-detail.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ProductRecord, CategoryRecord, PackagingUnitRecord, ProductPriceRecord } from '../../models/catalog.models';

const mockProduct: ProductRecord = {
  id: 'product-1',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  name: 'Urea 46% Nitrogen',
  sku: 'UREA-46-50KG',
  trackingMode: 'batch_expiry',
  baseUnitCode: 'BAG',
  measurementDimension: 'mass',
  status: 'active',
  version: 3,
};

const mockCategory: CategoryRecord = {
  id: 'cat-1',
  organizationId: 'org-1',
  name: 'Fertilizers',
  productClass: 'fertilizer',
  status: 'active',
  version: 1,
};

const mockPackagingUnits: PackagingUnitRecord[] = [
  {
    id: 'pkg-1',
    organizationId: 'org-1',
    productId: 'product-1',
    name: 'Pallet (20 Bags)',
    conversionFactor: '20',
    status: 'active',
    version: 1,
  },
];

const mockPrices: ProductPriceRecord[] = [
  {
    id: 'price-1',
    organizationId: 'org-1',
    productId: 'product-1',
    priceTier: 'retail',
    price: { amount: '4500.00', currency: 'PKR' },
    status: 'active',
    version: 1,
  },
];

describe('ProductDetailPage', () => {
  it('renders product inquiry data without form controls and links Edit to the explicit edit route', async () => {
    const api = {
      getProduct: vi.fn().mockReturnValue(of(mockProduct)),
      getCategory: vi.fn().mockReturnValue(of(mockCategory)),
      listPackagingUnits: vi.fn().mockReturnValue(of(mockPackagingUnits)),
      listPrices: vi.fn().mockReturnValue(of(mockPrices)),
    };

    await TestBed.configureTestingModule({
      imports: [ProductDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'product-1' }) } },
        },
        { provide: CatalogApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
            canEditField: () => true,
            canUseView: () => true,
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<ProductDetailPage> =
      TestBed.createComponent(ProductDetailPage);
    fixture.detectChanges();

    expect(api.getProduct).toHaveBeenCalledWith('product-1');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="product-detail-title"]')?.textContent).toContain(
      'Product Details',
    );
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="product-edit-link"]')
        ?.getAttribute('href'),
    ).toBe('/app/products/product-1/edit');
    expect(fixture.nativeElement.textContent).toContain('Urea 46% Nitrogen');
    expect(fixture.nativeElement.textContent).toContain('UREA-46-50KG');
    expect(fixture.nativeElement.textContent).toContain('Fertilizers');
  });
});
