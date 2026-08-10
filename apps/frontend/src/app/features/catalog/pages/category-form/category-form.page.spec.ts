import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CategoryFormPage } from './category-form.page';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('CategoryFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryFormPage],
      providers: [
        provideRouter([]),
        {
          provide: CatalogApi,
          useValue: {
            getCategory: () => of(null),
            createCategory: () => of({}),
            updateCategory: () => of({}),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();
  });

  it('renders create form', () => {
    const fixture: ComponentFixture<CategoryFormPage> = TestBed.createComponent(CategoryFormPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="category-form"]')).toBeTruthy();
  });
});
