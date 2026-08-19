import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierPaymentsPage } from './supplier-payments.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SupplierPaymentsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierPaymentsPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierPayments: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<SupplierPaymentsPage> =
      TestBed.createComponent(SupplierPaymentsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No supplier payments yet');
  });
});
