import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchesPage } from './branches.page';
import { BranchRecord, BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('BranchesPage', () => {
  const mockBranches: BranchRecord[] = [
    {
      id: 'br-1',
      organizationId: 'org-1',
      name: 'Multan Main Commercial Branch',
      code: 'MLT-01',
      invoicePrefix: 'MLT',
      status: 'active',
      version: 1,
    },
    {
      id: 'br-2',
      organizationId: 'org-1',
      name: 'Lodhran Branch',
      code: 'LOD-01',
      invoicePrefix: 'LOD',
      status: 'inactive',
      version: 2,
    },
  ];

  it('shows empty state when no branches exist', async () => {
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

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No branches yet');
    expect(fixture.nativeElement.textContent).toContain('Create the first branch');
  });

  it('shows filtered empty state when search yields no matches', async () => {
    const listBranchesSpy = vi.fn().mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );

    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: { listBranches: listBranchesSpy },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.search.set('Nonexistent');
    comp.reload();
    fixture.detectChanges();

    expect(listBranchesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Nonexistent' }),
      false,
    );
    expect(fixture.nativeElement.textContent).toContain('No matching branches');
  });

  it('renders branch list with Products visual conventions', async () => {
    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () =>
              of({
                items: mockBranches,
                meta: { page: 1, pageSize: 25, total: 2 },
              }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="branches-list"]')).toBeTruthy();
    expect(el.textContent).toContain('Multan Main Commercial Branch');
    expect(el.textContent).toContain('MLT');
    expect(el.textContent).toContain('MLT-01');
    expect(el.textContent).toContain('Active');
    expect(el.textContent).toContain('Lodhran Branch');
    expect(el.textContent).toContain('Inactive');
  });

  it('supports view-only access: hides create and actions column for users without branches.manage', async () => {
    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () =>
              of({
                items: mockBranches,
                meta: { page: 1, pageSize: 25, total: 2 },
              }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => perm === 'branches.view',
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Multan Main Commercial Branch');
    expect(el.querySelector('[data-testid="branch-create-link"]')).toBeNull();
    expect(el.querySelector('.branch-table__th--actions')).toBeNull();
    expect(el.querySelector('.row-actions')).toBeNull();
  });

  it('handles lifecycle status actions and dialogs for manage users', async () => {
    const updateSpy = vi.fn().mockReturnValue(of({}));
    const deleteSpy = vi.fn().mockReturnValue(of({ deleted: true }));

    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () =>
              of({
                items: mockBranches,
                meta: { page: 1, pageSize: 25, total: 2 },
              }),
            updateBranch: updateSpy,
            deleteBranch: deleteSpy,
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    const firstBranch = mockBranches[0];
    const secondBranch = mockBranches[1];
    if (!firstBranch || !secondBranch) {
      throw new Error('Mock branches missing');
    }

    comp.askDeactivate(firstBranch);
    expect(comp.confirmOpen()).toBe(true);
    expect(comp.confirmLabel()).toBe('Deactivate');
    comp.confirmLifecycle();
    expect(updateSpy).toHaveBeenCalledWith('br-1', {
      expectedVersion: 1,
      status: 'inactive',
    });

    comp.askReactivate(secondBranch);
    expect(comp.confirmOpen()).toBe(true);
    expect(comp.confirmLabel()).toBe('Reactivate');
    comp.confirmLifecycle();
    expect(updateSpy).toHaveBeenCalledWith('br-2', {
      expectedVersion: 2,
      status: 'active',
    });

    comp.askDelete(firstBranch);
    expect(comp.confirmOpen()).toBe(true);
    expect(comp.confirmLabel()).toBe('Delete permanently');
    comp.confirmLifecycle();
    expect(deleteSpy).toHaveBeenCalledWith('br-1');
  });

  it('handles force refresh and clear filters', () => {
    const listSpy = vi.fn().mockReturnValue(
      of({
        items: mockBranches,
        meta: { page: 1, pageSize: 25, total: 2 },
      }),
    );

    TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: { listBranches: listSpy },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.reload(true);
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 25 }),
      true,
    );

    comp.search.set('test');
    comp.statusFilter.set('inactive');
    expect(comp.hasActiveFilters()).toBe(true);

    comp.clearFilters();
    expect(comp.search()).toBe('');
    expect(comp.statusFilter()).toBe('all');
    expect(comp.hasActiveFilters()).toBe(false);
  });

  it('displays error alert on failure', () => {
    TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () =>
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 500,
                    error: { error: { message: 'Database failure' } },
                  }),
              ),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchesPage> = TestBed.createComponent(BranchesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Database failure');
  });

  describe('Organization Controls & Capability Gating', () => {
    it('blocks list API initialization and displays unavailable message when branches module capability is disabled', async () => {
      const listBranchesSpy = vi.fn();

      await TestBed.configureTestingModule({
        imports: [BranchesPage],
        providers: [
          provideRouter([]),
          {
            provide: BranchesWarehousesApi,
            useValue: { listBranches: listBranchesSpy },
          },
          {
            provide: AuthSessionStore,
            useValue: { hasPermission: () => true },
          },
          {
            provide: CapabilityService,
            useValue: {
              canUseModule: (key: string) => key !== 'branches',
              canUseFeature: () => true,
              canViewField: () => true,
              canPerformAction: () => true,
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchesPage);
      fixture.detectChanges();

      expect(listBranchesSpy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(
        'Branches module is unavailable for this organization.',
      );
    });

    it('hides module info when moduleInfo feature capability is disabled', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchesPage],
        providers: [
          provideRouter([]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              listBranches: () => of({ items: mockBranches, meta: { page: 1, pageSize: 25, total: 2 } }),
            },
          },
          {
            provide: AuthSessionStore,
            useValue: { hasPermission: () => true },
          },
          {
            provide: CapabilityService,
            useValue: {
              canUseModule: () => true,
              canUseFeature: (key: string) => key !== 'branches.features.moduleInfo',
              canViewField: () => true,
              canPerformAction: () => true,
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchesPage);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('agrivio-ui-module-info')).toBeNull();
    });

    it('hides search and statusFilter controls when corresponding features are disabled', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchesPage],
        providers: [
          provideRouter([]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              listBranches: () => of({ items: mockBranches, meta: { page: 1, pageSize: 25, total: 2 } }),
            },
          },
          {
            provide: AuthSessionStore,
            useValue: { hasPermission: () => true },
          },
          {
            provide: CapabilityService,
            useValue: {
              canUseModule: () => true,
              canUseFeature: (key: string) =>
                key !== 'branches.features.search' && key !== 'branches.features.statusFilter',
              canViewField: () => true,
              canPerformAction: () => true,
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchesPage);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.toolbar')).toBeNull();
    });

    it('hides code and status columns when field capabilities are disabled', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchesPage],
        providers: [
          provideRouter([]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              listBranches: () => of({ items: mockBranches, meta: { page: 1, pageSize: 25, total: 2 } }),
            },
          },
          {
            provide: AuthSessionStore,
            useValue: { hasPermission: () => true },
          },
          {
            provide: CapabilityService,
            useValue: {
              canUseModule: () => true,
              canUseFeature: () => true,
              canViewField: (key: string) =>
                key !== 'branches.fields.code' && key !== 'branches.fields.status',
              canPerformAction: () => true,
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchesPage);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.branch-table__th--code')).toBeNull();
      expect(el.querySelector('.branch-table__th--status')).toBeNull();
      expect(el.querySelector('.branch-table__th--branch')).toBeTruthy();
      expect(el.querySelector('.branch-table__th--prefix')).toBeTruthy();
    });

    it('hides create, edit, deactivate, reactivate, and delete when action capabilities are disabled', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchesPage],
        providers: [
          provideRouter([]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              listBranches: () => of({ items: mockBranches, meta: { page: 1, pageSize: 25, total: 2 } }),
            },
          },
          {
            provide: AuthSessionStore,
            useValue: { hasPermission: () => true },
          },
          {
            provide: CapabilityService,
            useValue: {
              canUseModule: () => true,
              canUseFeature: () => true,
              canViewField: () => true,
              canPerformAction: (key: string) => key === 'branches.actions.refresh',
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchesPage);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="branch-create-link"]')).toBeNull();
      expect(el.querySelector('.branch-table__th--actions')).toBeNull();
      expect(el.querySelector('.page-head__refresh-btn')).toBeTruthy();
    });
  });
});
