import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CategoriesPage } from './categories.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CategoriesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoriesPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: { listCategories: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<CategoriesPage> = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No categories yet');
  });
});
