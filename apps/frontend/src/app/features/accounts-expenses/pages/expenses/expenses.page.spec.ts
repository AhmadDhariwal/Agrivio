import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpensesPage } from './expenses.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpensesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpensesPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: { listExpenses: () => of([]), listCategories: () => of([]) } },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders empty expenses state', () => {
    const fixture: ComponentFixture<ExpensesPage> = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-create-link"]')).toBeTruthy();
  });
});
