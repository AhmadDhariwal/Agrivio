import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ImportsPage } from './imports.page';
import { ImportsApi } from '../../data-access/imports.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ImportsPage', () => {
  it('is defined', () => {
    expect(ImportsPage).toBeTruthy();
  });

  it('wraps preview error rows in an internal table scroller', async () => {
    await TestBed.configureTestingModule({
      imports: [ImportsPage],
      providers: [
        {
          provide: ImportsApi,
          useValue: {
            listTemplates: () =>
              of([
                {
                  importType: 'product_categories',
                  version: 1,
                  createUpdatePolicy: 'create-only',
                  columns: [{ key: 'name' }, { key: 'productClass' }],
                },
              ]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<ImportsPage> = TestBed.createComponent(ImportsPage);
    const page = fixture.componentInstance;
    page.job.set({
      id: 'job-1',
      status: 'previewed',
      preview: {
        totalRows: 1,
        validRows: 0,
        invalidRows: 1,
        createUpdatePolicy: 'create-only',
      },
    } as never);
    page.errors.set([
      {
        row: 3,
        field: 'name',
        code: 'required',
        message: 'Name is required for this extremely long import validation message.',
      },
    ]);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.querySelector('.ag-table-wrap') as HTMLElement | null;
    const table = fixture.nativeElement.querySelector('[data-testid="import-errors"]') as HTMLElement | null;
    expect(wrap).toBeTruthy();
    expect(table).toBeTruthy();
    expect(wrap?.contains(table)).toBe(true);
  });
});
