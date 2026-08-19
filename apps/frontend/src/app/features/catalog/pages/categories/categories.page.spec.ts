import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CategoriesPage } from './categories.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CategoryRecord } from '../../models/catalog.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('CategoriesPage', () => {
  let component: CategoriesPage;
  let fixture: ComponentFixture<CategoriesPage>;
  let capabilityState: ReturnType<typeof signal<Record<string, Record<string, boolean>>>>;

  const mockCategories: CategoryRecord[] = [
    {
      id: 'cat-1',
      organizationId: 'org-1',
      name: 'Fertilizers & Nutrients',
      productClass: 'fertilizer',
      status: 'active',
      version: 1,
    },
    {
      id: 'cat-2',
      organizationId: 'org-1',
      name: 'Farm Equipment',
      productClass: 'general',
      status: 'active',
      version: 2,
    },
  ];
  const firstCategory = mockCategories[0] as CategoryRecord;

  beforeEach(async () => {
    capabilityState = signal({});
    const capabilityValue = (key: string, mode: string) => capabilityState()[key]?.[mode] ?? true;
    await TestBed.configureTestingModule({
      imports: [CategoriesPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            listCategories: () =>
              of({
                items: mockCategories,
                meta: { page: 1, pageSize: 25, total: 2 },
              }),
            deleteCategory: () => of({ id: 'cat-1', deleted: true }),
            updateCategory: () => of(firstCategory),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseView: (key: string) => capabilityValue(key, 'enabled'),
            canShowWidget: (key: string) => capabilityValue(key, 'visible'),
            canViewField: (key: string) => capabilityValue(key, 'visible'),
            canPerformAction: (key: string) => capabilityValue(key, 'allowed'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoriesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders categories list with deliberate column structure on desktop', () => {
    expect(fixture.nativeElement.textContent).toContain('Fertilizers & Nutrients');
    expect(fixture.nativeElement.textContent).toContain('Fertilizer');
    expect(fixture.nativeElement.textContent).toContain('Batch required');
    expect(fixture.nativeElement.textContent).toContain('Farm Equipment');
    expect(fixture.nativeElement.textContent).toContain('Standard');
    expect(component.effectiveViewMode()).toBe('table');
  });

  it('renders authoritative Total Categories KPI card', () => {
    expect(fixture.nativeElement.textContent).toContain('Total Categories');
    expect(fixture.nativeElement.textContent).toContain('2');
  });

  it('toggles preferred view mode between table and cards on desktop', () => {
    expect(component.preferredViewMode()).toBe('table');
    component.setViewMode('cards');
    expect(component.preferredViewMode()).toBe('cards');
    expect(component.effectiveViewMode()).toBe('cards');
  });

  it('keeps mobile cards but removes disabled desktop cards and the Total Categories widget', () => {
    capabilityState.set({
      'inventory.categories.views.desktopCards': { enabled: false },
      'inventory.categories.widgets.totalCategories': { visible: false },
    });
    fixture.detectChanges();

    component.setViewMode('cards');
    expect(component.preferredViewMode()).toBe('table');
    expect(fixture.nativeElement.textContent).not.toContain('Total Categories');
    component.isMobile.set(true);
    expect(component.effectiveViewMode()).toBe('cards');
  });

  it('hides configured Category fields and blocked actions', () => {
    capabilityState.set({
      'inventory.categories.fields.productClass': { visible: false },
      'inventory.categories.actions.create': { allowed: false },
      'inventory.categories.actions.edit': { allowed: false },
      'inventory.categories.actions.delete': { allowed: false },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="category-create-link"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cat-table__th--class')).toBeNull();
    expect(component.canEdit()).toBe(false);
    expect(component.canDelete()).toBe(false);
  });

  it('forces effective view mode to cards when on mobile viewport', () => {
    component.setViewMode('table');
    component.isMobile.set(true);
    expect(component.effectiveViewMode()).toBe('cards');

    // Restores table view when viewport returns to desktop
    component.isMobile.set(false);
    expect(component.effectiveViewMode()).toBe('table');
  });

  it('manages mobile filter drawer open/close state', () => {
    expect(component.mobileFiltersOpen()).toBe(false);
    component.openMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(true);
    component.closeMobileFilters();
    expect(component.mobileFiltersOpen()).toBe(false);
  });

  it('opens and closes category inspector drawer with derived policy', () => {
    expect(component.selectedCategory()).toBeNull();
    component.openInspector(firstCategory);
    fixture.detectChanges();

    expect(component.selectedCategory()?.id).toBe('cat-1');
    expect(fixture.nativeElement.textContent).toContain('Category Identity');
    expect(fixture.nativeElement.textContent).toContain(
      'Batch tracking is mandatory for Fertilizer products',
    );

    component.closeInspector();
    expect(component.selectedCategory()).toBeNull();
  });

  it('toggles row action menu and closes on escape', () => {
    expect(component.openMenuCategoryId()).toBeNull();
    component.toggleRowMenu('cat-1', new MouseEvent('click'));
    expect(component.openMenuCategoryId()).toBe('cat-1');

    component.onEscape();
    expect(component.openMenuCategoryId()).toBeNull();
  });
});
