import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SalePrintPage } from './sale-print.page';
import { SalesApi } from '../../data-access/sales.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SalePrintInvoice } from '../../models/sales.models';

const postedInvoice: SalePrintInvoice = {
  invoiceNumber: 'P4A-000001',
  status: 'posted',
  saleDate: '2026-08-13',
  postedAt: '2026-08-13T10:00:00.000Z',
  branchNameSnapshot: 'P4 Branch',
  warehouseNameSnapshot: 'P4 WH',
  customerNameSnapshot: 'Walk-in',
  priceTierSnapshot: 'retail',
  notes: '',
  saleTotal: { amount: '100.00', currency: 'PKR' },
  paidTotal: { amount: '100.00', currency: 'PKR' },
  receivableTotal: { amount: '0.00', currency: 'PKR' },
  lines: [
    {
      productNameSnapshot: 'P4 Seed',
      unitCodeSnapshot: 'KG',
      conversionFactorSnapshot: '1',
      quantity: '2.0000',
      unitPrice: { amount: '50.00', currency: 'PKR' },
      lineProductAmount: { amount: '100.00', currency: 'PKR' },
    },
  ],
  payments: [
    {
      accountNameSnapshot: 'P4 Cash',
      accountTypeSnapshot: 'cash',
      amount: { amount: '100.00', currency: 'PKR' },
    },
  ],
};

describe('SalePrintPage', () => {
  async function setup(options?: {
    canView?: boolean;
    invoice?: SalePrintInvoice;
    error?: { status: number; message: string };
  }) {
    const canView = options?.canView ?? true;
    await TestBed.configureTestingModule({
      imports: [SalePrintPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'sale-1' } } },
        },
        {
          provide: SalesApi,
          useValue: {
            getPrintInvoice: () => {
              const loadError = options?.error;
              if (loadError) {
                return throwError(() => ({
                  status: loadError.status,
                  error: { error: { message: loadError.message } },
                }));
              }
              return of(options?.invoice ?? postedInvoice);
            },
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) => canView && permission === 'sales.view',
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<SalePrintPage> = TestBed.createComponent(SalePrintPage);
    fixture.detectChanges();
    return fixture;
  }

  it('renders posted snapshot values on the 80mm layout by default', async () => {
    const fixture = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="invoice-layout-80mm"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="invoice-number"]')?.textContent).toContain('P4A-000001');
    expect(el.querySelector('[data-testid="invoice-product-name"]')?.textContent).toContain('P4 Seed');
    expect(el.querySelector('[data-testid="invoice-unit-price"]')?.textContent).toContain('50.00');
    expect(el.querySelector('[data-testid="invoice-sale-total"]')?.textContent).toContain('100.00');
    expect(el.querySelector('[data-testid="invoice-customer"]')?.textContent).toContain('Walk-in');
  });

  it('switches to 58mm and A4 layouts', async () => {
    const fixture = await setup();
    const page = fixture.componentInstance;
    page.selectLayout('58mm');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="invoice-layout-58mm"]')).toBeTruthy();
    page.selectLayout('a4');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="invoice-layout-a4"]')).toBeTruthy();
  });

  it('denies print without sales.view', async () => {
    const fixture = await setup({ canView: false });
    expect(fixture.nativeElement.querySelector('[data-testid="print-permission-denied"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="invoice-print-button"]')).toBeFalsy();
  });

  it('keeps historical snapshot names even when the payload is immutable', async () => {
    const fixture = await setup({
      invoice: {
        ...postedInvoice,
            lines: [
              {
                productNameSnapshot: 'Historical Seed',
                unitCodeSnapshot: 'KG',
                conversionFactorSnapshot: '1',
                quantity: '2.0000',
                unitPrice: { amount: '50.00', currency: 'PKR' },
                lineProductAmount: { amount: '100.00', currency: 'PKR' },
              },
            ],
      },
    });
    expect(fixture.nativeElement.querySelector('[data-testid="invoice-product-name"]')?.textContent).toContain(
      'Historical Seed',
    );
    expect(fixture.nativeElement.textContent).not.toContain('P4 Seed RENAMED');
  });
});
