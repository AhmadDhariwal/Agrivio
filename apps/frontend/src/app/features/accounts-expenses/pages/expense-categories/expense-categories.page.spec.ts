import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseCategoriesPage } from './expense-categories.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpenseCategoriesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseCategoriesPage],
      providers: [
        provideRouter([]),
        {
          provide: ExpensesApi,
          useValue: {
            listCategories: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders expense category create link', () => {
    const fixture: ComponentFixture<ExpenseCategoriesPage> =
      TestBed.createComponent(ExpenseCategoriesPage);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="expense-category-create-link"]'),
    ).toBeTruthy();
  });
});
