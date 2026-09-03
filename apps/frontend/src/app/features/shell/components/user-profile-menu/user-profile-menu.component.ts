import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { AuthSessionLifecycleService } from '../../../auth/data-access/auth-session-lifecycle.service';

import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-user-profile-menu',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './user-profile-menu.component.html',
  styleUrl: './user-profile-menu.component.scss',
})
export class UserProfileMenuComponent {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly authLifecycle = inject(AuthSessionLifecycleService);
  private readonly elementRef = inject(ElementRef);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly isOpen = signal(false);
  readonly isSigningOut = signal(false);
  readonly signOutError = signal<string | null>(null);

  readonly session = this.sessionStore.session;
  readonly activeContext = this.sessionStore.activeContext;

  readonly userDisplayName = computed(() => this.session()?.user.displayName ?? 'User');
  readonly userEmail = computed(() => this.session()?.user.email ?? '');
  readonly userRole = computed(() => this.activeContext()?.role ?? '');

  readonly userInitials = computed(() => {
    const name = this.userDisplayName().trim();
    if (!name) return 'U';
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  });

  readonly canViewDashboard = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('dashboard.view');
    const hasCap = this.capabilityService?.canUseModule('dashboard') ?? true;
    return hasPerm && hasCap;
  });

  readonly canViewSettings = computed(() => {
    const active = this.activeContext();
    return (
      active?.contextType === 'organization' &&
      this.sessionStore.hasPermission('settings.view') &&
      (this.capabilityService?.canUseModule('settings') ?? true)
    );
  });

  readonly dashboardRoute = computed(() => (this.canViewDashboard() ? '/app/dashboard' : '/app'));

  toggleDropdown(): void {
    this.isOpen.set(!this.isOpen());
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeDropdown();
      const trigger = this.elementRef.nativeElement.querySelector(
        '.ag-profile-trigger',
      ) as HTMLElement | null;
      trigger?.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  signOut(): void {
    this.isSigningOut.set(true);
    this.signOutError.set(null);
    this.authLifecycle.signOut().subscribe({
      next: () => {
        this.isSigningOut.set(false);
        this.closeDropdown();
      },
      error: () => {
        this.isSigningOut.set(false);
        this.signOutError.set('Sign-out failed.');
      },
    });
  }
}
