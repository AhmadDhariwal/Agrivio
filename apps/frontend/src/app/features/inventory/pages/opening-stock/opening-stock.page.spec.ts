import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OpeningStockPage } from './opening-stock.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

function product(id: string, trackingMode: ProductRecord['trackingMode']): ProductRecord {
  return {
    id,
    organizationId: 'org-1',
    categoryId: 'cat-1',
    name: id,
    sku: id,
    trackingMode,
    baseUnitCode: 'KG',
    measurementDimension: 'mass',
    status: 'active',
    version: 1,
  };
}

describe('OpeningStockPage', () => {
  let fixture: ComponentFixture<OpeningStockPage>;
  let page: OpeningStockPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpeningStockPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: { postOpeningStock: () => of({}) } },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () =>
              of([
                product('prod-none', 'none'),
                product('prod-batch', 'batch'),
                product('prod-expiry', 'batch_expiry'),
              ]),
            listPackagingUnits: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouses: () =>
              of([
                {
                  id: 'wh-1',
                  organizationId: 'org-1',
                  name: 'Main',
                  status: 'active',
                  version: 1,
                },
              ]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OpeningStockPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps batch and expiry optional when tracking is off', () => {
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(false);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="opening-batch-number"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });

  it('requires batch and shows the required marker when batch tracking is on', () => {
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(true);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    const batchInput = fixture.nativeElement.querySelector(
      '[data-testid="opening-batch-number"]',
    ) as HTMLInputElement;
    expect(batchInput.getAttribute('aria-required')).toBe('true');
    expect(
      batchInput.closest('.ag-field')?.querySelector('.ag-field__required')?.textContent,
    ).toBe('*');
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });

  it('requires expiry and shows the required marker when expiry tracking is on', () => {
    page.form.controls.productId.setValue('prod-expiry');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(true);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(true);
    const expiryInput = fixture.nativeElement.querySelector(
      '[data-testid="opening-expiry-date"]',
    ) as HTMLInputElement;
    expect(expiryInput.getAttribute('aria-required')).toBe('true');
    expect(
      expiryInput.closest('.ag-field')?.querySelector('.ag-field__required')?.textContent,
    ).toBe('*');
  });

  it('removes the conditional validators and markers when tracking is turned off', () => {
    page.form.controls.productId.setValue('prod-expiry');
    fixture.detectChanges();
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(false);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="opening-batch-number"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });
});
