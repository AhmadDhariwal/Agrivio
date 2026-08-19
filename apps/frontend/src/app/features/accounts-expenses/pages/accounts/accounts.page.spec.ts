import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountsPage } from './accounts.page';
import { AccountsApi } from '../../data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('AccountsPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountsPage],
      providers: [
        provideRouter([]),
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
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
    const fixture: ComponentFixture<AccountsPage> = TestBed.createComponent(AccountsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No accounts yet');
  });
});
