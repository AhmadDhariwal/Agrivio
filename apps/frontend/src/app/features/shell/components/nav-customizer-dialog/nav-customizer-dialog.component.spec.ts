import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NavCustomizerDialogComponent } from './nav-customizer-dialog.component';
import { NavigationService } from '../../data-access/navigation.service';
import { NavigationApi } from '../../data-access/navigation.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('NavCustomizerDialogComponent', () => {
  async function createComponent() {
    const store = {
      activeContext: () => ({
        contextType: 'organization',
        organizationId: 'org-1',
        role: 'Owner',
        permissions: ['dashboard.view', 'sales.view', 'purchases.view'],
      }),
      hasPermission: (p: string) =>
        ['dashboard.view', 'sales.view', 'purchases.view'].includes(p),
    };

    const navApi = {
      getPreferences: () => of({ hiddenItemIds: [] }),
      updatePreferences: (ids: string[]) => of({ hiddenItemIds: ids }),
    };

    await TestBed.configureTestingModule({
      imports: [NavCustomizerDialogComponent],
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: store },
        { provide: NavigationApi, useValue: navApi },
        NavigationService,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(NavCustomizerDialogComponent);
    const navService = TestBed.inject(NavigationService);
    return { fixture, navService };
  }

  it('renders dialog when isCustomizerOpen is true', async () => {
    const { fixture, navService } = await createComponent();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Customize Navigation');

    navService.openCustomizer();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Customize Navigation');
    expect(fixture.nativeElement.textContent).toContain('Reset to default');
  });

  it('toggles items in customizer and cancels without saving', async () => {
    const { fixture, navService } = await createComponent();
    navService.openCustomizer();
    fixture.detectChanges();

    // Toggle sales.new
    navService.toggleDraftItem('sales.new');
    expect(navService.customizerDraftHidden().has('sales.new')).toBe(true);

    // Cancel
    navService.closeCustomizer();
    fixture.detectChanges();

    expect(navService.isCustomizerOpen()).toBe(false);
    expect(navService.hiddenItemIds().has('sales.new')).toBe(false);
  });
});
