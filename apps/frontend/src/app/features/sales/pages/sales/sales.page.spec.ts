import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SalesPage } from './sales.page';
import { SalesApi } from '../../data-access/sales.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SalesPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            listSales: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('shows empty state', () => {
    const fixture: ComponentFixture<SalesPage> = TestBed.createComponent(SalesPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No sales');
  });
});
