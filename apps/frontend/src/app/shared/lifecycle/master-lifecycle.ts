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
