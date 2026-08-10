import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomersPage } from './customers.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CustomersPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomersPage],
      providers: [
        provideRouter([]),
        {
          provide: CustomersApi,
          useValue: { listCustomers: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<CustomersPage> = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No customers yet');
  });
});
