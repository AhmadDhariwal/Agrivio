import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierFormPage } from './supplier-form.page';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SupplierFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierFormPage],
      providers: [
        provideRouter([]),
        {
          provide: SuppliersApi,
          useValue: {
            getSupplier: () => of(null),
            createSupplier: () => of({}),
            updateSupplier: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<SupplierFormPage> = TestBed.createComponent(SupplierFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-form"]')).toBeTruthy();
  });
});
