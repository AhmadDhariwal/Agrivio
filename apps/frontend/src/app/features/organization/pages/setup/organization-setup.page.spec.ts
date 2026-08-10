import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OrganizationSetupPage } from './organization-setup.page';
import { OrganizationSetupApi } from '../../data-access/organization-setup.api';

describe('OrganizationSetupPage', () => {
  it('renders derived setup steps', () => {
    TestBed.configureTestingModule({
      imports: [OrganizationSetupPage],
      providers: [
        provideRouter([]),
        {
          provide: OrganizationSetupApi,
          useValue: {
            getSetupProgress: () =>
              of({
                steps: [
                  {
                    id: 'branch',
                    title: 'Create a branch',
                    status: 'incomplete',
                    href: '/app/branches',
                    permission: 'branches.view',
                  },
                ],
                readyForOperations: false,
                notes: ['Inventory/Purchases/Sales not in scope yet'],
              }),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(OrganizationSetupPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Create a branch');
    expect(fixture.nativeElement.textContent).toContain('incomplete');
  });
});
