import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthSessionStore } from './auth-session.store';
import { AuthSessionContext, SessionContextSelection } from './auth.api';

@Component({
  selector: 'agrivio-context-switcher-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './context-switcher.page.html',
  styleUrl: './context-switcher.page.scss',
})
export class ContextSwitcherPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly activeContext = this.sessionStore.activeContext;
  readonly availableContexts = this.sessionStore.availableContexts;
  readonly canViewOrganization = computed(() =>
    this.sessionStore.hasPermission('organization.view'),
  );

  readonly form = this.formBuilder.nonNullable.group({
    contextKey: [''],
    branchId: [''],
    warehouseId: [''],
  });

  constructor() {
    if (this.sessionStore.session() === null) {
      this.sessionStore.loadSession().subscribe({
        error: () => {
          this.errorMessage.set('Sign in to manage active context.');
        },
      });
    }
  }

  contextLabel(context: AuthSessionContext): string {
    if (context.contextType === 'platform') {
      return `Platform · ${context.role}`;
    }
    return `Organization ${context.organizationId} · ${context.role}`;
  }

  contextKey(context: AuthSessionContext): string {
    if (context.contextType === 'platform') {
      return 'platform';
    }
    return `organization:${context.membershipId ?? context.organizationId}`;
  }

  submit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const raw = this.form.getRawValue();
    if (raw.contextKey === '') {
      this.errorMessage.set('Select an authorized context.');
      return;
    }

    const selection = this.toSelection(raw.contextKey, raw.branchId, raw.warehouseId);
    if (selection === null) {
      this.errorMessage.set('Selected context is not available.');
      return;
    }

    this.submitting.set(true);
    this.sessionStore.switchContext(selection).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Active context updated.');
        void this.router.navigateByUrl('/app');
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set(
          'Context switch failed. Access was denied or the selection is invalid.',
        );
      },
    });
  }

  continueToWorkspace(): void {
    void this.router.navigateByUrl('/app');
  }

  private toSelection(
    contextKey: string,
    branchId: string,
    warehouseId: string,
  ): SessionContextSelection | null {
    if (contextKey === 'platform') {
      return { contextType: 'platform' };
    }

    const match = this.availableContexts().find((item) => this.contextKey(item) === contextKey);
    if (match === undefined || match.contextType !== 'organization') {
      return null;
    }

    return {
      contextType: 'organization',
      ...(match.membershipId === undefined ? {} : { membershipId: match.membershipId }),
      ...(match.organizationId === undefined ? {} : { organizationId: match.organizationId }),
      branchId: branchId.trim() === '' ? null : branchId.trim(),
      warehouseId: warehouseId.trim() === '' ? null : warehouseId.trim(),
    };
  }
}
