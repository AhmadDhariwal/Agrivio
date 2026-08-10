import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EmployeesPage } from './employees.page';
import { UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('EmployeesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeesPage],
      providers: [
        provideRouter([]),
        { provide: UsersAccessApi, useValue: { listEmployees: () => of([]) } },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<EmployeesPage> = TestBed.createComponent(EmployeesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No employees yet');
  });
});
