import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WarehouseFormPage } from './warehouse-form.page';
import { BranchesWarehousesApi, WarehouseRecord } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('WarehouseFormPage', () => {
  const mockWarehouse: WarehouseRecord = {
    id: 'wh-1',
    organizationId: 'org-1',
    name: 'Central Distribution Hub (Multan)',
    code: 'WH-MLT-01',
    status: 'active',
    version: 1,
  };

  let createWarehouseSpy: ReturnType<typeof vi.fn>;
  let updateWarehouseSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createWarehouseSpy = vi.fn().mockReturnValue(of(mockWarehouse));
    updateWarehouseSpy = vi.fn().mockReturnValue(of(mockWarehouse));

    await TestBed.configureTestingModule({
      imports: [WarehouseFormPage],
      providers: [
        provideRouter([{ path: 'app/warehouses', component: WarehouseFormPage }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getWarehouse: () => of(mockWarehouse),
            createWarehouse: createWarehouseSpy,
            updateWarehouse: updateWarehouseSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? null : null),
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('renders create form with guidance card', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="warehouse-form"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Warehouse code guidance');
    expect(fixture.nativeElement.textContent).toContain('Short and easy to remember');
  });

  it('validates required warehouse name on submit', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({ name: '', code: '' });
    comp.save();

    expect(comp.form.invalid).toBe(true);
    expect(createWarehouseSpy).not.toHaveBeenCalled();
  });

  it('submits valid create warehouse payload', () => {
    const fixture: ComponentFixture<WarehouseFormPage> = TestBed.createComponent(WarehouseFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      name: 'Lahore Central Warehouse',
      code: 'LHR-CENTRAL',
    });

    comp.save();

    expect(createWarehouseSpy).toHaveBeenCalledWith({
      name: 'Lahore Central Warehouse',
      code: 'LHR-CENTRAL',
    });
  });
});
