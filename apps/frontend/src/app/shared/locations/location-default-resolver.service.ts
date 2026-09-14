import { Injectable, inject } from '@angular/core';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

export interface BranchLocationOption {
  id: string;
  status: string;
  isDefault?: boolean;
}

export interface WarehouseLocationOption extends BranchLocationOption {
  branchId?: string | null;
}

export interface LocationResolution<T> {
  options: T[];
  selectedId: string;
  isOnlyOption: boolean;
  usedDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class LocationDefaultResolverService {
  private readonly sessionStore = inject(AuthSessionStore);

  resolveBranches<T extends BranchLocationOption>(
    options: readonly T[],
    currentId = '',
  ): LocationResolution<T> {
    const valid = this.sessionStore.filterBranches(options.filter((item) => item.status === 'active'));
    return this.resolve(
      valid,
      currentId,
      this.sessionStore.activeContext?.()?.branchId ?? '',
      (item) => item.isDefault === true,
    );
  }

  resolveWarehouses<T extends WarehouseLocationOption>(
    options: readonly T[],
    branchId: string,
    currentId = '',
  ): LocationResolution<T> {
    if (!branchId) {
      return { options: [], selectedId: '', isOnlyOption: false, usedDefault: false };
    }
    const valid = this.sessionStore.filterWarehouses(
      options.filter(
        (item) =>
          item.status === 'active' &&
          (item.branchId == null || item.branchId === branchId),
      ),
    );
    const activeCtx = this.sessionStore.activeContext?.();
    const preferredId =
      !activeCtx?.branchId || activeCtx.branchId === branchId
        ? (activeCtx?.warehouseId ?? '')
        : '';
    const branchDefault = valid.find(
      (item) => item.isDefault === true && item.branchId === branchId,
    );
    const organizationDefault = valid.find(
      (item) => item.isDefault === true && (item.branchId == null || item.branchId === undefined),
    );
    const defaultWarehouse = branchDefault ?? organizationDefault;
    return this.resolve(
      valid,
      currentId,
      preferredId,
      (item) => item.id === defaultWarehouse?.id,
    );
  }

  private resolve<T extends { id: string }>(
    options: T[],
    currentId: string,
    preferredId: string,
    isDefault: (item: T) => boolean,
  ): LocationResolution<T> {
    const onlyOption = options.length === 1 ? options[0] : undefined;
    if (onlyOption) {
      return { options, selectedId: onlyOption.id, isOnlyOption: true, usedDefault: true };
    }
    const current = options.find((item) => item.id === currentId);
    if (current) {
      return { options, selectedId: current.id, isOnlyOption: false, usedDefault: false };
    }
    const preferred = options.find((item) => item.id === preferredId);
    if (preferred) {
      return { options, selectedId: preferred.id, isOnlyOption: false, usedDefault: true };
    }
    const configuredDefault = options.find(isDefault);
    return {
      options,
      selectedId: configuredDefault?.id ?? '',
      isOnlyOption: false,
      usedDefault: configuredDefault !== undefined,
    };
  }
}
