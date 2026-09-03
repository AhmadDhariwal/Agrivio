import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { UserProfileMenuComponent } from './user-profile-menu.component';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { AuthSessionLifecycleService } from '../../../auth/data-access/auth-session-lifecycle.service';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('UserProfileMenuComponent', () => {
  let fixture: ComponentFixture<UserProfileMenuComponent>;
  let component: UserProfileMenuComponent;
  let authLifecycle: { signOut: ReturnType<typeof vi.fn> };
  let sessionStore: {
    session: () => unknown;
    activeContext: () => unknown;
    hasPermission: (perm: string) => boolean;
    clear: () => void;
  };

  beforeEach(async () => {
    authLifecycle = {
      signOut: vi.fn().mockReturnValue(of(undefined)),
    };

    sessionStore = {
      session: () => ({
        user: {
          id: 'u1',
          displayName: 'Ahmad Dhariwal',
          email: 'ahmad@agrivio.com',
          status: 'active',
        },
        activeContext: {
          contextType: 'organization',
          organizationId: 'org-1',
          role: 'Owner',
          permissions: ['dashboard.view', 'settings.view'],
        },
        availableContexts: [],
        subscriptionAccessState: null,
      }),
      activeContext: () => ({
        contextType: 'organization',
        organizationId: 'org-1',
        role: 'Owner',
        permissions: ['dashboard.view', 'settings.view'],
      }),
      hasPermission: (perm: string) => ['dashboard.view', 'settings.view'].includes(perm),
      clear: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileMenuComponent],
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: sessionStore },
        { provide: AuthSessionLifecycleService, useValue: authLifecycle },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders trigger with user initials, name, and role', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('AD');
    expect(text).toContain('Ahmad Dhariwal');
    expect(text).toContain('Owner');
  });

  it('toggles dropdown on click', () => {
    expect(component.isOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.ag-profile-menu')).toBeFalsy();

    const trigger = fixture.nativeElement.querySelector('.ag-profile-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    const menu = fixture.nativeElement.querySelector('.ag-profile-menu');
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain('ahmad@agrivio.com');
    expect(menu.textContent).toContain('Dashboard');
    expect(menu.textContent).toContain('Settings');
    expect(menu.textContent).toContain('Sign out');
  });

  it('closes dropdown on Escape key', () => {
    component.toggleDropdown();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);
  });

  it('delegates sign-out to the shared authentication lifecycle', () => {
    component.toggleDropdown();
    fixture.detectChanges();

    component.signOut();
    expect(authLifecycle.signOut).toHaveBeenCalledOnce();
  });

  it('hides Settings link when settings module capability is disabled', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [UserProfileMenuComponent],
      providers: [
        provideRouter([]),
        { provide: AuthSessionStore, useValue: sessionStore },
        { provide: AuthSessionLifecycleService, useValue: authLifecycle },
        {
          provide: CapabilityService,
          useValue: { canUseModule: (m: string) => m !== 'settings' },
        },
      ],
    }).compileComponents();

    const customFixture = TestBed.createComponent(UserProfileMenuComponent);
    const customComp = customFixture.componentInstance;
    customFixture.detectChanges();

    customComp.toggleDropdown();
    customFixture.detectChanges();

    const menu = customFixture.nativeElement.querySelector('.ag-profile-menu');
    expect(menu).toBeTruthy();
    expect(customComp.canViewSettings()).toBe(false);
    expect(menu.textContent).not.toContain('Settings');
  });
});
