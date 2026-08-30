import { Injectable, inject } from '@angular/core';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';
import {
  hasMissingOperationalAssignments,
  isOrganizationWideRole,
} from '../../features/auth/data-access/assignment-scope.util';
import { CapabilityService } from '../../features/capabilities/data-access/capability.service';

/**
 * Shared frontend access helpers. Backend authorization remains authoritative.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilities = inject(CapabilityService, { optional: true });

  can(permissionCode: string): boolean {
    return this.sessionStore.hasPermission(permissionCode);
  }

  canAny(permissionCodes: readonly string[]): boolean {
    return permissionCodes.some((code) => this.can(code));
  }

  canAll(permissionCodes: readonly string[]): boolean {
    return permissionCodes.every((code) => this.can(code));
  }

  hasCapability(key: string): boolean {
    return this.capabilities?.canUseModule(key) ?? true;
  }

  canAccessModule(permissionCode: string, capabilityKey?: string): boolean {
    if (!this.can(permissionCode)) {
      return false;
    }
    if (capabilityKey === undefined || capabilityKey === '') {
      return true;
    }
    return this.hasCapability(capabilityKey);
  }

  isOrganizationWide(): boolean {
    return isOrganizationWideRole(this.sessionStore.activeContext()?.role);
  }

  hasMissingAssignments(): boolean {
    return hasMissingOperationalAssignments(this.sessionStore.activeContext());
  }
}
