import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ReturnsListPage } from './returns-list.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('ReturnsListPage', () => {
  it('lists returns when permitted', async () => {
    await TestBed.configureTestingModule({
      imports: [ReturnsListPage],
      providers: [
        provideRouter([]),
        {
          provide: ReturnsApi,
          useValue: { listReturns: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<ReturnsListPage> = TestBed.createComponent(ReturnsListPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Returns');
  });
});
