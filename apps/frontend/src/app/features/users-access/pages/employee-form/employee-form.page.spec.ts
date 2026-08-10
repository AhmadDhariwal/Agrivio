import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EmployeeFormPage } from './employee-form.page';
import { UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('EmployeeFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeFormPage],
      providers: [
        provideRouter([]),
        {
          provide: UsersAccessApi,
          useValue: {
            getEmployee: () => of(null),
            createEmployee: () => of({}),
            updateEmployee: () => of({}),
            replaceAccessAssignments: () => of({}),
            listAssignmentBranches: () => of([]),
            listAssignmentWarehouses: () => of([]),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<EmployeeFormPage> = TestBed.createComponent(EmployeeFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="employee-form"]')).toBeTruthy();
  });
});
