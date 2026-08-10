import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { WarehouseFormPage } from './warehouse-form.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('WarehouseFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WarehouseFormPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getWarehouse: () => of(null),
            createWarehouse: () => of({}),
            updateWarehouse: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="warehouse-form"]')).toBeTruthy();
  });
});
