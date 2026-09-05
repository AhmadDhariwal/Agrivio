import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ImportsPage } from './imports.page';
import { ImportsApi } from '../../data-access/imports.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('ImportsPage', () => {
  const mockApi = {
    listTemplates: vi.fn(() =>
      of([
        {
          importType: 'product_categories',
          version: 1,
          createUpdatePolicy: 'create-only',
          columns: [{ key: 'name', required: true }, { key: 'productClass', required: true }],
        },
        {
          importType: 'products',
          version: 1,
          createUpdatePolicy: 'create-only',
          columns: [
            { key: 'sku', required: true },
            { key: 'name', required: true },
            { key: 'categoryName', required: true },
            { key: 'trackingMode', required: true },
            { key: 'baseUnitCode', required: true },
            { key: 'measurementDimension', required: true },
          ],
        },
      ]),
    ),
    downloadTemplate: vi.fn(() =>
      of({
        blob: new Blob(['mock-xls-content'], { type: 'application/vnd.ms-excel' }),
        filename: 'product_categories-template.xls',
        contentType: 'application/vnd.ms-excel',
      }),
    ),
    createJob: vi.fn(() => of({ id: 'job-1', importType: 'product_categories', status: 'created' })),
    upload: vi.fn(() => of({ id: 'job-1', importType: 'product_categories', status: 'uploaded' })),
    validate: vi.fn(() =>
      of({
        id: 'job-1',
        importType: 'product_categories',
        status: 'previewed',
        preview: {
          templateType: 'product_categories',
          templateVersion: 1,
          createUpdatePolicy: 'create-only',
          totalRows: 2,
          validRows: 2,
          invalidRows: 0,
        },
        errors: [],
      }),
    ),
    confirm: vi.fn(() => of({ id: 'job-1', status: 'confirmed' })),
    execute: vi.fn(() => of({ id: 'job-1', status: 'completed', result: { createdCount: 2 } })),
  };

  const mockSessionStore = {
    hasPermission: vi.fn(() => true),
    session: vi.fn(() => ({ subscriptionAccessState: { status: 'active' } })),
  };

  const mockCapabilityService = {
    canUseFeature: vi.fn((_feature?: string) => true),
    canPerformAction: vi.fn((_action?: string) => true),
  };



  async function createComponent(overrides?: {
    api?: Partial<typeof mockApi>;
    sessionStore?: Partial<typeof mockSessionStore>;
    capabilityService?: {
      canUseFeature?: (feature: string) => boolean;
      canPerformAction?: (action: string) => boolean;
    };
  }) {
    await TestBed.configureTestingModule({
      imports: [ImportsPage],
      providers: [
        { provide: ImportsApi, useValue: { ...mockApi, ...overrides?.api } },
        { provide: AuthSessionStore, useValue: { ...mockSessionStore, ...overrides?.sessionStore } },
        {
          provide: CapabilityService,
          useValue: {
            canUseFeature: (feature: string) =>
              overrides?.capabilityService?.canUseFeature
                ? overrides.capabilityService.canUseFeature(feature)
                : mockCapabilityService.canUseFeature(feature),
            canPerformAction: (action: string) =>
              overrides?.capabilityService?.canPerformAction
                ? overrides.capabilityService.canPerformAction(action)
                : mockCapabilityService.canPerformAction(action),
          },
        },
      ],
    }).compileComponents();



    const fixture: ComponentFixture<ImportsPage> = TestBed.createComponent(ImportsPage);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance };
  }

  it('is defined', async () => {
    const { page } = await createComponent();
    expect(page).toBeTruthy();
  });

  it('renders friendly import type names and no raw v1 in select options', async () => {
    const { fixture } = await createComponent();
    const select = fixture.nativeElement.querySelector('[data-testid="import-type"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.options);
    expect(options.length).toBe(2);
    expect(options[0]?.textContent?.trim()).toBe('Product categories');
    expect(options[1]?.textContent?.trim()).toBe('Products');
    expect(options[0]?.value).toBe('product_categories');
  });

  it('wraps preview error rows in an internal table scroller', async () => {
    const { fixture, page } = await createComponent();
    page.job.set({
      id: 'job-1',
      importType: 'product_categories',
      templateVersion: 1,
      status: 'previewed',
      preview: {
        templateType: 'product_categories',
        templateVersion: 1,
        createUpdatePolicy: 'create-only',
        totalRows: 1,
        validRows: 0,
        invalidRows: 1,
      },
    } as never);
    page.errors.set([
      {
        row: 3,
        field: 'name',
        code: 'required',
        message: 'Name is required for this import row.',
      },
    ]);
    fixture.detectChanges();

    const wrap = fixture.nativeElement.querySelector('.ag-table-wrap') as HTMLElement | null;
    const table = fixture.nativeElement.querySelector('[data-testid="import-errors"]') as HTMLElement | null;
    expect(wrap).toBeTruthy();
    expect(table).toBeTruthy();
    expect(wrap?.contains(table)).toBe(true);
  });

  it('does not clear a valid preview when import type is unchanged', async () => {
    const { page } = await createComponent();
    const file = new File(['ok'], 'categories.xls');
    page.setFile(file);
    page.job.set({ id: 'job-1', status: 'previewed' } as never);

    page.onTypeChange('product_categories');

    expect(page.job()?.id).toBe('job-1');
    expect(page.selectedFile()).toBe(file);
  });

  it('invalidates preview and errors when changing import type', async () => {
    const { page } = await createComponent();
    page.job.set({ id: 'job-1', status: 'previewed' } as never);
    page.errors.set([{ row: 1, field: 'name', message: 'err' }]);

    page.onTypeChange('products');

    expect(page.selectedType()).toBe('products');
    expect(page.job()).toBeNull();
    expect(page.errors()).toEqual([]);
  });

  it('invalidates preview and errors when selecting a new file', async () => {
    const { page } = await createComponent();
    page.job.set({ id: 'job-1', status: 'previewed' } as never);
    page.errors.set([{ row: 1, field: 'name', message: 'err' }]);

    const file = new File(['test'], 'test.xlsx', { type: 'application/vnd.ms-excel' });
    page.setFile(file);

    expect(page.selectedFile()).toBe(file);
    expect(page.job()).toBeNull();
    expect(page.errors()).toEqual([]);
  });

  it('disables execute button when invalidRows > 0', async () => {
    const { fixture, page } = await createComponent();
    page.job.set({
      id: 'job-1',
      importType: 'product_categories',
      templateVersion: 1,
      status: 'previewed',
      preview: {
        templateType: 'product_categories',
        templateVersion: 1,
        createUpdatePolicy: 'create-only',
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
      },
    } as never);
    fixture.detectChanges();

    const executeBtn = fixture.nativeElement.querySelector('[data-testid="import-execute"]') as HTMLButtonElement | null;
    expect(executeBtn?.disabled).toBe(true);
  });

  it('enables execute button when invalidRows === 0 and status is previewed', async () => {
    const { fixture, page } = await createComponent();
    page.setFile(new File(['ok'], 'categories.xls'));
    page.job.set({
      id: 'job-1',
      importType: 'product_categories',
      templateVersion: 1,
      status: 'previewed',
      preview: {
        templateType: 'product_categories',
        templateVersion: 1,
        createUpdatePolicy: 'create-only',
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
      },
    } as never);
    fixture.detectChanges();

    const executeBtn = fixture.nativeElement.querySelector('[data-testid="import-execute"]') as HTMLButtonElement | null;
    expect(executeBtn?.disabled).toBe(false);
  });

  it('keeps execute disabled until a workbook file is selected', async () => {
    const { fixture, page } = await createComponent();
    page.job.set({
      id: 'job-1',
      importType: 'product_categories',
      templateVersion: 1,
      status: 'previewed',
      preview: {
        templateType: 'product_categories',
        templateVersion: 1,
        createUpdatePolicy: 'create-only',
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
      },
    } as never);
    fixture.detectChanges();

    const executeBtn = fixture.nativeElement.querySelector('[data-testid="import-execute"]') as HTMLButtonElement | null;
    expect(executeBtn?.disabled).toBe(true);
  });

  it('gates template download button with imports.features.templateDownloads capability', async () => {
    const { fixture } = await createComponent({
      capabilityService: {
        canUseFeature: vi.fn((f: string) => f !== 'imports.features.templateDownloads'),
        canPerformAction: vi.fn(() => true),
      },
    });

    const downloadBtn = fixture.nativeElement.querySelector('.workflow-actions button');
    expect(downloadBtn?.textContent).not.toContain('Download template');
  });

  it('calls downloadTemplate on api when download button is clicked and triggers browser download', async () => {
    const { page } = await createComponent();
    const createUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeUrlSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const downloadSpy = vi.spyOn(mockApi, 'downloadTemplate');
    page.downloadTemplate();

    expect(downloadSpy).toHaveBeenCalledWith('product_categories');
    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:mock-url');

    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });




  it('ignores a stale preview response after the selected file changes', async () => {
    let resolveCreateJob:
      | ((job: { id: string; importType: string; status: string }) => void)
      | undefined;
    const { page } = await createComponent({
      api: {
        createJob: vi.fn(
          () =>
            new Observable<{ id: string; importType: string; status: string }>((subscriber) => {
              resolveCreateJob = (job) => subscriber.next(job);
            }),
        ),
      },
    });
    const file = new File(['old'], 'old.xlsx');
    page.setFile(file);
    page.startPreview();
    page.setFile(new File(['new'], 'new.xlsx'));
    resolveCreateJob?.({ id: 'stale-job', importType: 'product_categories', status: 'created' });

    expect(page.job()).toBeNull();
    expect(page.loading()).toBe(false);
  });

  it('handles pagination for error issues', async () => {
    const { page } = await createComponent();
    const manyErrors = Array.from({ length: 25 }, (_, i) => ({
      row: i + 1,
      field: `field_${i}`,
      message: `Error ${i}`,
    }));
    page.errors.set(manyErrors);

    expect(page.totalPages()).toBe(3);
    expect(page.pagedErrors().length).toBe(10);
    expect(page.pagedErrors()[0]?.row).toBe(1);

    page.goToPage(2);
    expect(page.page()).toBe(2);
    expect(page.pagedErrors()[0]?.row).toBe(11);
  });
});
