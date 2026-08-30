import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BranchesPage } from './branches.page';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('BranchesPage', () => {
  it('shows empty state', async () => {
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
  });

  it('keeps a long branch name inside the identity column', async () => {
    const longName =
      'North-West Regional Distribution and Retail Operations Branch — Multan Canal Road Extension';
    await TestBed.configureTestingModule({
      imports: [BranchesPage],
      providers: [
        provideRouter([]),
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () =>
              of({
                items: [
                  {
                    id: 'br-1',
                    name: longName,
                    invoicePrefix: 'NW-MUL-EXT',
                    code: 'NW-LONG-CODE',
                    status: 'active',
                  },
                ],
                meta: { page: 1, pageSize: 25, total: 1 },
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
    const name = fixture.nativeElement.querySelector('.branch-row__name') as HTMLElement | null;
    const actions = fixture.nativeElement.querySelector('.branch-row__actions') as HTMLElement | null;
    expect(name?.textContent).toContain(longName);
    expect(actions).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="branches-list"]')).toBeTruthy();
  });
});
