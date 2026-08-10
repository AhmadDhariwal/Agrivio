import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BranchFormPage } from './branch-form.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BranchFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: () => of({}),
            updateBranch: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="branch-form"]')).toBeTruthy();
  });
});
