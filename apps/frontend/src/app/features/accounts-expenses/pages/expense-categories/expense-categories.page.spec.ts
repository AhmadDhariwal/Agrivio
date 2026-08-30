import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseCategoriesPage } from './expense-categories.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ExpenseCategoriesPage', () => {
  let mockApi: { listCategories: ReturnType<typeof vi.fn>; updateCategory: ReturnType<typeof vi.fn>; deleteCategory: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockApi = {
      listCategories: vi.fn().mockReturnValue(
        of({
          items: [
            { id: 'cat-1', name: 'Machinery Maintenance', status: 'active', organizationId: 'org-1', version: 1 },
            { id: 'cat-2', name: 'Office Stationery', status: 'inactive', organizationId: 'org-1', version: 2 },
          ],
          meta: { page: 1, pageSize: 25, total: 2 },
        }),
      ),
      updateCategory: vi.fn().mockReturnValue(of({ id: 'cat-1', status: 'inactive', version: 2 })),
      deleteCategory: vi.fn().mockReturnValue(of({ id: 'cat-2', deleted: true })),
    };

    await TestBed.configureTestingModule({
      imports: [ExpenseCategoriesPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders categories table with data', () => {
    const fixture: ComponentFixture<ExpenseCategoriesPage> = TestBed.createComponent(ExpenseCategoriesPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Expense categories');
    expect(text).toContain('Machinery Maintenance');
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-create-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-edit"]')).toBeTruthy();
  });

  it('shows empty state when no categories match', async () => {
    mockApi.listCategories.mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }));
    const fixture: ComponentFixture<ExpenseCategoriesPage> = TestBed.createComponent(ExpenseCategoriesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No expense categories found');
  });

  it('calls listCategories with status filter', () => {
    const fixture: ComponentFixture<ExpenseCategoriesPage> = TestBed.createComponent(ExpenseCategoriesPage);
    fixture.detectChanges();
    expect(mockApi.listCategories).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('hides create link and management actions when user lacks expenses.post', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ExpenseCategoriesPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: (perm: string) => perm === 'expenses.view' } },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<ExpenseCategoriesPage> = TestBed.createComponent(ExpenseCategoriesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-create-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-edit"]')).toBeFalsy();
  });
});
