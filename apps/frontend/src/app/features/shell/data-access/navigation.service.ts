import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { NavigationApi, NavigationPreferencesPayload } from './navigation.api';
import {
  CANONICAL_NAVIGATION,
  NavCustomizerEntry,
  NavCustomizerGroupItem,
  NavCustomizerTree,
  NavEntry,
  NavGroup,
  NavItem,
  VisibleNavEntry,
} from './navigation.model';
import { insertIdBefore, mergeCanonicalOrder, moveIdInOrder } from './navigation-order';
import { CapabilityService } from '../../capabilities/data-access/capability.service';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly navigationApi = inject(NavigationApi);
  private readonly router = inject(Router);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly hiddenItemIds = signal<Set<string>>(new Set());
  readonly groupOrder = signal<readonly string[]>([]);
  readonly itemOrderByGroup = signal<Readonly<Record<string, readonly string[]>>>({});
  readonly searchTerm = signal<string>('');
  readonly customizerSearchTerm = signal<string>('');
  readonly collapsedGroupIds = signal<Set<string>>(new Set());
  readonly isCustomizerOpen = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly customizerDraftHidden = signal<Set<string>>(new Set());
  readonly customizerDraftGroupOrder = signal<readonly string[]>([]);
  readonly customizerDraftItemOrderByGroup = signal<Readonly<Record<string, readonly string[]>>>(
    {},
  );
  readonly saveError = signal<string | null>(null);
  readonly isLoaded = signal<boolean>(false);
  readonly reorderAnnouncement = signal<string>('');

  private readonly activeContext = this.sessionStore.activeContext;

  isItemPermitted(item: NavItem): boolean {
    if (item.permission && !this.sessionStore.hasPermission(item.permission)) {
      return false;
    }
    if (item.capabilityKey && !(this.capabilityService?.canUseModule(item.capabilityKey) ?? true)) {
      return false;
    }
    return true;
  }

  isGroupPermitted(group: NavGroup): boolean {
    const active = this.activeContext();
    if (group.contextType === 'platform' && active?.contextType !== 'platform') {
      return false;
    }
    return true;
  }

  readonly permittedEntries = computed<readonly NavEntry[]>(() => {
    const result: NavEntry[] = [];

    for (const entry of CANONICAL_NAVIGATION) {
      if (entry.type === 'item') {
        if (this.isItemPermitted(entry.item)) {
          result.push(entry);
        }
      } else if (entry.type === 'group') {
        if (!this.isGroupPermitted(entry.group)) {
          continue;
        }
        const permittedChildren = entry.group.children.filter((child) =>
          this.isItemPermitted(child),
        );
        if (permittedChildren.length > 0) {
          result.push({
            type: 'group',
            group: {
              ...entry.group,
              children: permittedChildren,
            },
          });
        }
      }
    }

    return result;
  });

  readonly userVisibleEntries = computed<readonly VisibleNavEntry[]>(() => {
    const ordered = this.orderEntries(
      this.permittedEntries(),
      this.groupOrder(),
      this.itemOrderByGroup(),
    );
    const hidden = this.hiddenItemIds();
    const result: VisibleNavEntry[] = [];

    for (const entry of ordered) {
      if (entry.type === 'item') {
        if (!hidden.has(entry.item.id)) {
          result.push({ type: 'item', item: entry.item });
        }
      } else if (entry.type === 'group') {
        const visibleChildren = entry.group.children.filter((child) => !hidden.has(child.id));
        if (visibleChildren.length > 0) {
          result.push({
            type: 'group',
            group: {
              id: entry.group.id,
              label: entry.group.label,
              ...(entry.group.icon !== undefined ? { icon: entry.group.icon } : {}),
              children: visibleChildren,
            },
          });
        }
      }
    }

    return result;
  });

  readonly filteredEntries = computed<readonly VisibleNavEntry[]>(() => {
    const entries = this.userVisibleEntries();
    const query = this.searchTerm().trim().toLowerCase();

    if (!query) {
      return entries;
    }

    const result: VisibleNavEntry[] = [];

    for (const entry of entries) {
      if (entry.type === 'item') {
        if (entry.item.label.toLowerCase().includes(query)) {
          result.push(entry);
        }
      } else if (entry.type === 'group') {
        const groupLabelMatches = entry.group.label.toLowerCase().includes(query);
        if (groupLabelMatches) {
          result.push(entry);
        } else {
          const matchingChildren = entry.group.children.filter((child) =>
            child.label.toLowerCase().includes(query),
          );
          if (matchingChildren.length > 0) {
            result.push({
              type: 'group',
              group: {
                ...entry.group,
                children: matchingChildren,
              },
            });
          }
        }
      }
    }

    return result;
  });

  readonly customizerTree = computed<NavCustomizerTree>(() => {
    const query = this.customizerSearchTerm().trim().toLowerCase();
    const isFiltered = query.length > 0;
    const draftHidden = this.customizerDraftHidden();
    const ordered = this.orderEntries(
      this.permittedEntries(),
      this.customizerDraftGroupOrder(),
      this.customizerDraftItemOrderByGroup(),
    );

    const entries: NavCustomizerEntry[] = [];

    for (const entry of ordered) {
      if (entry.type === 'item') {
        const matches = !query || entry.item.label.toLowerCase().includes(query);
        if (matches) {
          entries.push({
            type: 'item',
            item: {
              id: entry.item.id,
              label: entry.item.label,
              route: entry.item.route,
              visible: !draftHidden.has(entry.item.id),
            },
          });
        }
      } else if (entry.type === 'group') {
        const groupMatches = !query || entry.group.label.toLowerCase().includes(query);
        const children = entry.group.children;
        const matchingChildren = groupMatches
          ? children
          : children.filter((c) => c.label.toLowerCase().includes(query));

        if (matchingChildren.length > 0) {
          const items: NavCustomizerGroupItem[] = matchingChildren.map((c) => ({
            id: c.id,
            label: c.label,
            route: c.route,
            visible: !draftHidden.has(c.id),
          }));

          const visibleCount = items.filter((i) => i.visible).length;
          let state: 'checked' | 'unchecked' | 'indeterminate' = 'indeterminate';
          if (visibleCount === items.length) {
            state = 'checked';
          } else if (visibleCount === 0) {
            state = 'unchecked';
          }

          entries.push({
            type: 'group',
            group: {
              id: entry.group.id,
              label: entry.group.label,
              state,
              items,
            },
          });
        }
      }
    }

    return { entries, isFiltered };
  });

  constructor() {
    this.initFromCurrentRoute();
  }

  initFromCurrentRoute(): void {
    const url = this.router.url;
    for (const entry of CANONICAL_NAVIGATION) {
      if (entry.type === 'group') {
        const hasActiveChild = entry.group.children.some(
          (child) => url === child.route || url.startsWith(child.route + '/'),
        );
        if (hasActiveChild) {
          this.expandGroup(entry.group.id);
        }
      }
    }
  }

  isGroupExpanded(groupId: string): boolean {
    if (this.searchTerm().trim().length > 0) {
      return true;
    }
    return !this.collapsedGroupIds().has(groupId);
  }

  toggleGroup(groupId: string): void {
    const current = new Set(this.collapsedGroupIds());
    if (current.has(groupId)) {
      current.delete(groupId);
    } else {
      current.add(groupId);
    }
    this.collapsedGroupIds.set(current);
  }

  expandGroup(groupId: string): void {
    const current = new Set(this.collapsedGroupIds());
    current.delete(groupId);
    this.collapsedGroupIds.set(current);
  }

  setSearchTerm(term: string): void {
    this.searchTerm.set(term);
  }

  setCustomizerSearchTerm(term: string): void {
    this.customizerSearchTerm.set(term);
  }

  openCustomizer(): void {
    this.customizerDraftHidden.set(new Set(this.hiddenItemIds()));
    this.customizerDraftGroupOrder.set([...this.groupOrder()]);
    this.customizerDraftItemOrderByGroup.set({ ...this.itemOrderByGroup() });
    this.customizerSearchTerm.set('');
    this.saveError.set(null);
    this.reorderAnnouncement.set('');
    this.isCustomizerOpen.set(true);
  }

  closeCustomizer(): void {
    this.isCustomizerOpen.set(false);
    this.saveError.set(null);
    this.reorderAnnouncement.set('');
  }

  toggleDraftItem(itemId: string): void {
    const current = new Set(this.customizerDraftHidden());
    if (current.has(itemId)) {
      current.delete(itemId);
    } else {
      current.add(itemId);
    }
    this.customizerDraftHidden.set(current);
  }

  toggleDraftGroup(groupId: string): void {
    const group = this.customizerTree().entries.find(
      (entry) => entry.type === 'group' && entry.group.id === groupId,
    );
    if (!group || group.type !== 'group') return;

    const current = new Set(this.customizerDraftHidden());
    if (group.group.state === 'checked') {
      for (const item of group.group.items) {
        current.add(item.id);
      }
    } else {
      for (const item of group.group.items) {
        current.delete(item.id);
      }
    }
    this.customizerDraftHidden.set(current);
  }

  resetDraftToDefault(): void {
    this.customizerDraftHidden.set(new Set());
    this.customizerDraftGroupOrder.set([]);
    this.customizerDraftItemOrderByGroup.set({});
    this.reorderAnnouncement.set('Navigation reset to default order and visibility.');
  }

  moveDraftGroup(groupId: string, delta: number): void {
    if (this.customizerTree().isFiltered) return;
    const order = this.currentDraftTopLevelIds();
    const next = moveIdInOrder(order, groupId, delta);
    if (next === order || next.join('\0') === order.join('\0')) return;
    this.customizerDraftGroupOrder.set(next);
    this.announceMove(groupId, delta);
  }

  moveDraftChild(groupId: string, itemId: string, delta: number): void {
    if (this.customizerTree().isFiltered) return;
    const order = this.currentDraftChildIds(groupId);
    const next = moveIdInOrder(order, itemId, delta);
    if (next.join('\0') === order.join('\0')) return;
    this.customizerDraftItemOrderByGroup.set({
      ...this.customizerDraftItemOrderByGroup(),
      [groupId]: next,
    });
    this.announceMove(itemId, delta);
  }

  dropDraftGroup(draggedId: string, targetId: string): void {
    if (this.customizerTree().isFiltered) return;
    const order = this.currentDraftTopLevelIds();
    if (!order.includes(draggedId) || !order.includes(targetId)) return;
    this.customizerDraftGroupOrder.set(insertIdBefore(order, draggedId, targetId));
    this.reorderAnnouncement.set(`Moved ${this.labelForId(draggedId)}.`);
  }

  dropDraftChild(groupId: string, draggedId: string, targetId: string): void {
    if (this.customizerTree().isFiltered) return;
    const order = this.currentDraftChildIds(groupId);
    if (!order.includes(draggedId) || !order.includes(targetId)) return;
    this.customizerDraftItemOrderByGroup.set({
      ...this.customizerDraftItemOrderByGroup(),
      [groupId]: insertIdBefore(order, draggedId, targetId),
    });
    this.reorderAnnouncement.set(`Moved ${this.labelForId(draggedId)}.`);
  }

  saveCustomizer(): void {
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.saveError.set(null);

    const payload: NavigationPreferencesPayload = {
      hiddenItemIds: [...this.customizerDraftHidden()],
      groupOrder: [...this.currentDraftTopLevelIds()],
      itemOrderByGroup: this.currentDraftItemOrderByGroup(),
    };

    this.navigationApi.updatePreferences(payload).subscribe({
      next: (response) => {
        this.applyPreferences(response);
        this.isSaving.set(false);
        this.isCustomizerOpen.set(false);
      },
      error: () => {
        this.isSaving.set(false);
        this.saveError.set('Failed to save navigation preferences. Please try again.');
      },
    });
  }

  loadPreferences(): void {
    this.navigationApi.getPreferences().subscribe({
      next: (response) => {
        this.applyPreferences(response);
        this.isLoaded.set(true);
      },
      error: () => {
        this.applyPreferences({ hiddenItemIds: [], groupOrder: [], itemOrderByGroup: {} });
        this.isLoaded.set(true);
      },
    });
  }

  private applyPreferences(response: {
    hiddenItemIds?: readonly string[];
    groupOrder?: readonly string[];
    itemOrderByGroup?: Readonly<Record<string, readonly string[]>>;
  }): void {
    this.hiddenItemIds.set(new Set(response.hiddenItemIds ?? []));
    this.groupOrder.set([...(response.groupOrder ?? [])]);
    this.itemOrderByGroup.set({ ...(response.itemOrderByGroup ?? {}) });
  }

  private orderEntries(
    entries: readonly NavEntry[],
    groupOrder: readonly string[],
    itemOrderByGroup: Readonly<Record<string, readonly string[]>>,
  ): NavEntry[] {
    const byId = new Map(entries.map((entry) => [this.entryId(entry), entry]));
    const orderedIds = mergeCanonicalOrder(
      entries.map((entry) => this.entryId(entry)),
      groupOrder,
    );

    return orderedIds
      .map((id) => byId.get(id))
      .filter((entry): entry is NavEntry => entry !== undefined)
      .map((entry) => {
        if (entry.type !== 'group') {
          return entry;
        }
        const childIds = mergeCanonicalOrder(
          entry.group.children.map((child) => child.id),
          itemOrderByGroup[entry.group.id],
        );
        const childrenById = new Map(entry.group.children.map((child) => [child.id, child]));
        return {
          type: 'group' as const,
          group: {
            ...entry.group,
            children: childIds
              .map((id) => childrenById.get(id))
              .filter((child): child is NavItem => child !== undefined),
          },
        };
      });
  }

  private currentDraftTopLevelIds(): string[] {
    return mergeCanonicalOrder(
      this.permittedEntries().map((entry) => this.entryId(entry)),
      this.customizerDraftGroupOrder(),
    );
  }

  private currentDraftChildIds(groupId: string): string[] {
    const group = this.permittedEntries().find(
      (entry) => entry.type === 'group' && entry.group.id === groupId,
    );
    if (!group || group.type !== 'group') {
      return [];
    }
    return mergeCanonicalOrder(
      group.group.children.map((child) => child.id),
      this.customizerDraftItemOrderByGroup()[groupId],
    );
  }

  private currentDraftItemOrderByGroup(): Record<string, string[]> {
    const next: Record<string, string[]> = {};
    for (const entry of this.permittedEntries()) {
      if (entry.type === 'group') {
        next[entry.group.id] = this.currentDraftChildIds(entry.group.id);
      }
    }
    return next;
  }

  private entryId(entry: NavEntry): string {
    return entry.type === 'item' ? entry.item.id : entry.group.id;
  }

  private announceMove(id: string, delta: number): void {
    const direction = delta < 0 ? 'up' : 'down';
    this.reorderAnnouncement.set(`Moved ${this.labelForId(id)} ${direction}.`);
  }

  private labelForId(id: string): string {
    for (const entry of this.permittedEntries()) {
      if (entry.type === 'item' && entry.item.id === id) {
        return entry.item.label;
      }
      if (entry.type === 'group') {
        if (entry.group.id === id) {
          return entry.group.label;
        }
        const child = entry.group.children.find((item) => item.id === id);
        if (child) {
          return child.label;
        }
      }
    }
    return id;
  }
}
