import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SuppliersPage } from './suppliers.page';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SuppliersPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SuppliersPage],
      providers: [
        provideRouter([]),
        {
          provide: SuppliersApi,
          useValue: { listSuppliers: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<SuppliersPage> = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No suppliers yet');
  });
});
