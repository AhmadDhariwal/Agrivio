import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountFormPage } from './account-form.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('AccountFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountFormPage],
      providers: [
        provideRouter([]),
        {
          provide: AccountsApi,
          useValue: {
            getAccount: () => of(null),
            createAccount: () => of({}),
            updateAccount: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<AccountFormPage> = TestBed.createComponent(AccountFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="account-form"]')).toBeTruthy();
  });
});
