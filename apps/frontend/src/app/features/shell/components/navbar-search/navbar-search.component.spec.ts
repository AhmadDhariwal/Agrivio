import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NavbarSearchComponent } from './navbar-search.component';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';

describe('NavbarSearchComponent', () => {
  let fixture: ComponentFixture<NavbarSearchComponent>;
  let component: NavbarSearchComponent;
  let router: Router;

  const mockCatalogApi = {
    listProducts: vi.fn().mockReturnValue(
      of([
        { id: 'prod-1', name: 'Urea 50kg', sku: 'UREA-50', baseUnitCode: 'bag' } as any,
      ]),
    ),
  };

  const mockSessionStore = {
    activeContext: () => ({
      contextType: 'organization',
      organizationId: 'org-1',
      role: 'Owner',
      permissions: ['catalog.view'],
    }),
    hasPermission: (perm: string) => perm === 'catalog.view',
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    mockCatalogApi.listProducts.mockClear();

    await TestBed.configureTestingModule({
      imports: [NavbarSearchComponent],
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CatalogApi, useValue: mockCatalogApi },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(NavbarSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]');
    expect(input).toBeTruthy();
    expect(input.placeholder).toContain('Search products');
  });

  it('does not trigger search when input length is less than 2', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'U';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    expect(mockCatalogApi.listProducts).not.toHaveBeenCalled();
    expect(component.groups().length).toBe(0);
    expect(fixture.nativeElement.querySelector('.ag-nav-search__dropdown')).toBeFalsy();
  });

  it('searches products with server-side query and limit when input >= 2 chars', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Urea';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    expect(mockCatalogApi.listProducts).toHaveBeenCalledWith({ q: 'Urea', limit: 5, status: 'active' });
    expect(component.groups().length).toBe(1);
    const dropdown = fixture.nativeElement.querySelector('.ag-nav-search__dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown.textContent).toContain('Products');
    expect(dropdown.textContent).toContain('Urea 50kg');
  });

  it('navigates with keyboard and Enter key', () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Urea';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    // Arrow down to highlight first item
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeIndex()).toBe(0);

    // Enter to select
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigateSpy).toHaveBeenCalledWith('/app/products/prod-1');
  });

  it('closes dropdown on Escape key', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Urea';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isOpen()).toBe(false);
  });

  it('clears search when clearSearch is called', () => {
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'Urea';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(350);
    fixture.detectChanges();

    component.clearSearch();
    expect(component.searchTerm()).toBe('');
    expect(component.groups().length).toBe(0);
    expect(component.isOpen()).toBe(false);
  });
});
