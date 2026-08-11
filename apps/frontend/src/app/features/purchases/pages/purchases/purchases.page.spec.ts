import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PurchasesPage } from './purchases.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('PurchasesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PurchasesPage],
      providers: [
        provideRouter([]),
        {
          provide: PurchasesApi,
          useValue: { listPurchases: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No purchases');
  });
});
