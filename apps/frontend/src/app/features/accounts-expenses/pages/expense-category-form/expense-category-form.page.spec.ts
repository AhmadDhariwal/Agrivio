import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ExpenseCategoryFormPage } from './expense-category-form.page';
import { ExpensesApi } from '../../data-access/expenses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('ExpenseCategoryFormPage', () => {
  let mockApi: {
    listCategories: ReturnType<typeof vi.fn>;
    createCategory: ReturnType<typeof vi.fn>;
    updateCategory: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockApi = {
      listCategories: vi.fn().mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } })),
      createCategory: vi.fn().mockReturnValue(of({ id: 'cat-1' })),
      updateCategory: vi.fn().mockReturnValue(of({ id: 'cat-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [ExpenseCategoryFormPage],
      providers: [
        provideRouter([]),
        { provide: ExpensesApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canPerformAction: () => true,
            canViewField: () => true,
            canEditField: () => true,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<ExpenseCategoryFormPage> = TestBed.createComponent(ExpenseCategoryFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="expense-category-name"]')).toBeTruthy();
  });

  it('disables save while name is missing', () => {
    const fixture: ComponentFixture<ExpenseCategoryFormPage> = TestBed.createComponent(ExpenseCategoryFormPage);
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="expense-category-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks invalid submit without calling createCategory', () => {
    const fixture: ComponentFixture<ExpenseCategoryFormPage> = TestBed.createComponent(ExpenseCategoryFormPage);
    fixture.detectChanges();
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(mockApi.createCategory).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });
});
