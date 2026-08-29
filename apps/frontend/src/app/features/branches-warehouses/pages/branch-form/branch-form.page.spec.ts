import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BranchFormPage } from './branch-form.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BranchFormPage', () => {
  let createBranchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
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

  it('disables save while required fields are missing', () => {
    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="branch-save"]',
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('blocks invalid submit without calling createBranch', () => {
    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.save();
    fixture.detectChanges();

    expect(createBranchSpy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Name is required.');
  });

  it('submits valid create branch payload', () => {
    const fixture: ComponentFixture<BranchFormPage> = TestBed.createComponent(BranchFormPage);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.patchValue({
      name: 'Multan Main',
      invoicePrefix: 'MLT-01',
      code: 'BR-MLT',
    });
    comp.save();

    expect(createBranchSpy).toHaveBeenCalledWith({
      name: 'Multan Main',
      invoicePrefix: 'MLT-01',
      code: 'BR-MLT',
    });
  });
});
