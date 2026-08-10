import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WarehousesPage } from './warehouses.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('WarehousesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WarehousesPage],
      providers: [
        provideRouter([]),
        { provide: BranchesWarehousesApi, useValue: { listWarehouses: () => of([]) } },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<WarehousesPage> = TestBed.createComponent(WarehousesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No warehouses yet');
  });
});
