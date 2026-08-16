export function mergeCanonicalOrder(
  canonicalIds: readonly string[],
  preferredOrder: readonly string[] | undefined,
): string[] {
  const known = new Set(canonicalIds);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const id of preferredOrder ?? []) {
    if (known.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }

  for (const id of canonicalIds) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

export function moveIdInOrder(ids: readonly string[], id: string, delta: number): string[] {
  const current = [...ids];
  const index = current.indexOf(id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
    return current;
  }
  const [moved] = current.splice(index, 1);
  if (moved === undefined) {
    return [...ids];
  }
  current.splice(nextIndex, 0, moved);
  return current;
}

export function insertIdBefore(
  ids: readonly string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) {
    return [...ids];
  }
  const current = ids.filter((id) => id !== draggedId);
  const targetIndex = current.indexOf(targetId);
  if (targetIndex < 0) {
    return mergeCanonicalOrder(ids, [...ids, draggedId]);
  }
  current.splice(targetIndex, 0, draggedId);
  return current;
}
