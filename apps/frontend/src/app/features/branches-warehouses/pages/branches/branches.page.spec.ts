import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BranchesPage } from './branches.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BranchesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
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
    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No branches yet');
  });
});
