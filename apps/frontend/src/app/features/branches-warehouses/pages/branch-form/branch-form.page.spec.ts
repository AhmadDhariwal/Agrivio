import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchFormPage } from './branch-form.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('BranchFormPage', () => {
  let createBranchSpy: ReturnType<typeof vi.fn>;
  let updateBranchSpy: ReturnType<typeof vi.fn>;

  const defaultCapabilityMock = {
    canUseModule: () => true,
    canUseFeature: () => true,
    canViewField: () => true,
    canPerformAction: () => true,
  };

  it('renders create form with live invoice numbering preview', async () => {
    createBranchSpy = vi.fn().mockReturnValue(of({}));
    updateBranchSpy = vi.fn().mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: createBranchSpy,
            updateBranch: updateBranchSpy,
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="branch-form"]')).toBeTruthy();
    expect(el.textContent).toContain('Create branch');
    expect(el.textContent).toContain('Invoice numbering preview');
    expect(el.textContent).toContain('BRN-000001');

    // Changing prefix updates preview
    const comp = fixture.componentInstance;
    comp.form.controls.invoicePrefix.setValue('khi');
    fixture.detectChanges();
    expect(comp.previewPrefix).toBe('KHI');
    expect(comp.previewInvoiceNumber).toBe('KHI-000001');
    expect(el.textContent).toContain('KHI-000001');
  });

  it('disables save while required fields are missing', async () => {
    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: vi.fn(),
            updateBranch: vi.fn(),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="branch-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks invalid submit without calling createBranch', async () => {
    createBranchSpy = vi.fn().mockReturnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: createBranchSpy,
            updateBranch: vi.fn(),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.save();
    fixture.detectChanges();

    expect(createBranchSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });

  it('submits valid create branch payload with uppercase normalized prefix', async () => {
    createBranchSpy = vi.fn().mockReturnValue(of({ id: 'br-new' }));
    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: createBranchSpy,
            updateBranch: vi.fn(),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      name: 'Multan Main',
      invoicePrefix: 'mlt-01',
      code: 'BR-MLT',
    });
    comp.save();

    expect(createBranchSpy).toHaveBeenCalledWith({
      name: 'Multan Main',
      invoicePrefix: 'MLT-01',
      code: 'BR-MLT',
    });
  });

  it('loads existing branch in edit mode and submits update payload', async () => {
    const existingBranch = {
      id: 'br-123',
      organizationId: 'org-1',
      name: 'Existing Branch',
      code: 'EX-01',
      invoicePrefix: 'EXB',
      status: 'active',
      version: 4,
    };
    updateBranchSpy = vi.fn().mockReturnValue(of(existingBranch));

    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: new Map([['id', 'br-123']]) },
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(existingBranch),
            createBranch: vi.fn(),
            updateBranch: updateBranchSpy,
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.branchId()).toBe('br-123');
    expect(comp.form.controls.name.value).toBe('Existing Branch');
    expect(comp.form.controls.invoicePrefix.value).toBe('EXB');
    expect(comp.form.controls.code.value).toBe('EX-01');
    expect(comp.form.controls.status.value).toBe('active');

    // Update branch details
    comp.form.patchValue({
      name: 'Existing Branch Updated',
      status: 'inactive',
    });
    comp.save();

    expect(updateBranchSpy).toHaveBeenCalledWith('br-123', {
      expectedVersion: 4,
      name: 'Existing Branch Updated',
      invoicePrefix: 'EXB',
      code: 'EX-01',
      status: 'inactive',
    });
  });

  it('handles plan limit and version conflict errors gracefully', async () => {
    createBranchSpy = vi.fn().mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { error: { message: 'Plan limit reached for branches.' } },
          }),
      ),
    );

    await TestBed.configureTestingModule({
      imports: [BranchFormPage],
      providers: [
        provideRouter([{ path: '**', component: class {} }]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            getBranch: () => of(null),
            createBranch: createBranchSpy,
            updateBranch: vi.fn(),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        { provide: CapabilityService, useValue: defaultCapabilityMock },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      name: 'Branch Exceeding Limit',
      invoicePrefix: 'LIM',
    });
    comp.save();
    fixture.detectChanges();

    expect(comp.errorMessage()).toContain('Plan limit reached for branches.');
  });

  describe('Organization Controls & Capability Gating', () => {
    it('hides code field when code field capability is disabled', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchFormPage],
        providers: [
          provideRouter([{ path: '**', component: class {} }]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              getBranch: () => of(null),
              createBranch: vi.fn(),
              updateBranch: vi.fn(),
            },
          },
          { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
          {
            provide: CapabilityService,
            useValue: {
              ...defaultCapabilityMock,
              canViewField: (key: string) => key !== 'branches.fields.code',
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchFormPage);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="branch-code"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="branch-name"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="branch-invoice-prefix"]')).toBeTruthy();
    });

    it('hides status field when status field capability is disabled in edit mode', async () => {
      const existingBranch = {
        id: 'br-123',
        organizationId: 'org-1',
        name: 'Existing Branch',
        code: 'EX-01',
        invoicePrefix: 'EXB',
        status: 'active',
        version: 4,
      };

      await TestBed.configureTestingModule({
        imports: [BranchFormPage],
        providers: [
          provideRouter([{ path: '**', component: class {} }]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: new Map([['id', 'br-123']]) },
            },
          },
          {
            provide: BranchesWarehousesApi,
            useValue: {
              getBranch: () => of(existingBranch),
              createBranch: vi.fn(),
              updateBranch: vi.fn(),
            },
          },
          { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
          {
            provide: CapabilityService,
            useValue: {
              ...defaultCapabilityMock,
              canViewField: (key: string) => key !== 'branches.fields.status',
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchFormPage);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="branch-status"]')).toBeNull();
    });

    it('disables save when action capability create is disabled on create', async () => {
      await TestBed.configureTestingModule({
        imports: [BranchFormPage],
        providers: [
          provideRouter([{ path: '**', component: class {} }]),
          {
            provide: BranchesWarehousesApi,
            useValue: {
              getBranch: () => of(null),
              createBranch: vi.fn(),
              updateBranch: vi.fn(),
            },
          },
          { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
          {
            provide: CapabilityService,
            useValue: {
              ...defaultCapabilityMock,
              canPerformAction: (key: string) => key !== 'branches.actions.create',
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchFormPage);
      fixture.detectChanges();

      const comp = fixture.componentInstance;
      comp.form.patchValue({
        name: 'Valid Branch',
        invoicePrefix: 'VAL',
      });
      fixture.detectChanges();

      expect(comp.canSave()).toBe(false);
      const saveBtn = fixture.nativeElement.querySelector('[data-testid="branch-save"]') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('disables save when action capability edit is disabled on edit', async () => {
      const existingBranch = {
        id: 'br-123',
        organizationId: 'org-1',
        name: 'Existing Branch',
        code: 'EX-01',
        invoicePrefix: 'EXB',
        status: 'active',
        version: 4,
      };

      await TestBed.configureTestingModule({
        imports: [BranchFormPage],
        providers: [
          provideRouter([{ path: '**', component: class {} }]),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: new Map([['id', 'br-123']]) },
            },
          },
          {
            provide: BranchesWarehousesApi,
            useValue: {
              getBranch: () => of(existingBranch),
              createBranch: vi.fn(),
              updateBranch: vi.fn(),
            },
          },
          { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
          {
            provide: CapabilityService,
            useValue: {
              ...defaultCapabilityMock,
              canPerformAction: (key: string) => key !== 'branches.actions.edit',
            },
          },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(BranchFormPage);
      fixture.detectChanges();

      const comp = fixture.componentInstance;
      expect(comp.canSave()).toBe(false);
      const saveBtn = fixture.nativeElement.querySelector('[data-testid="branch-save"]') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });
});
