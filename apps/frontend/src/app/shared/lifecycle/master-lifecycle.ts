import { HttpErrorResponse } from '@angular/common/http';

export type MasterLifecycleFilter = 'all' | 'active' | 'inactive';

export function filterMasterLifecycle<T extends { status: string }>(
  items: T[],
  filter: MasterLifecycleFilter,
): T[] {
  if (filter === 'all') {
    return items;
  }
  return items.filter((item) => item.status === filter);
}

export function deactivateCopy(entityLabel: string, historyNote: string): {
  title: string;
  message: string;
} {
  return {
    title: `Deactivate ${entityLabel}?`,
    message: `This ${entityLabel} will no longer be available for new transactions. ${historyNote}`,
  };
}

export function reactivateCopy(entityLabel: string): { title: string; message: string } {
  return {
    title: `Reactivate ${entityLabel}?`,
    message: `This ${entityLabel} will be available again for new transactions. Historical records stay unchanged.`,
  };
}

export function deletePermanentlyCopy(entityLabel: string): { title: string; message: string } {
  return {
    title: `Delete ${entityLabel} permanently?`,
    message:
      'This cannot be undone. The record will be removed only if it has no business or history references.',
  };
}

export function recordInUseMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const code = error.error?.error?.code;
    const details = error.error?.error?.details;
    const refs = Array.isArray(details)
      ? details
          .map((item: { message?: string }) =>
            item && typeof item.message === 'string' ? item.message : '',
          )
          .filter((item: string) => item !== '')
          .join(', ')
      : '';
    if (code === 'RECORD_IN_USE') {
      return refs === ''
        ? 'This record cannot be deleted because it is in use. Deactivate it instead.'
        : `Cannot delete: referenced by ${refs}. Deactivate it instead.`;
    }
    return error.error?.error?.message ?? fallback;
  }
  return fallback;
}
