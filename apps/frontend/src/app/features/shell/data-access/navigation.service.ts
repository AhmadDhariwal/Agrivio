import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { NavigationApi } from './navigation.api';
import {
  CANONICAL_NAVIGATION,
  NavCustomizerGroup,
  NavCustomizerGroupItem,
  NavCustomizerTree,
  NavEntry,
  NavGroup,
  NavItem,
  VisibleNavEntry,
} from './navigation.model';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly navigationApi = inject(NavigationApi);
  private readonly router = inject(Router);

  readonly hiddenItemIds = signal<Set<string>>(new Set());
  readonly searchTerm = signal<string>('');
  readonly customizerSearchTerm = signal<string>('');
  readonly collapsedGroupIds = signal<Set<string>>(new Set());
  readonly isCustomizerOpen = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly customizerDraftHidden = signal<Set<string>>(new Set());
  readonly saveError = signal<string | null>(null);
  readonly isLoaded = signal<boolean>(false);

  private readonly activeContext = this.sessionStore.activeContext;

  /**
   * Evaluates whether a given item is permitted in current user & active context.
   */
  isItemPermitted(item: NavItem): boolean {
    if (item.permission && !this.sessionStore.hasPermission(item.permission)) {
      return false;
    }
    return true;
  }

  /**
   * Evaluates whether a group is permitted in current user & active context.
   */
  isGroupPermitted(group: NavGroup): boolean {
    const active = this.activeContext();
    if (group.contextType === 'platform' && active?.contextType !== 'platform') {
      return false;
    }
    return true;
  }

  /**
   * All permitted navigation items and groups with their permitted children.
   */
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

  /**
   * Permitted and user-visible navigation entries (respecting saved hiddenItemIds).
   */
  readonly userVisibleEntries = computed<readonly VisibleNavEntry[]>(() => {
    const permitted = this.permittedEntries();
    const hidden = this.hiddenItemIds();
    const result: VisibleNavEntry[] = [];

    for (const entry of permitted) {
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

  /**
   * Filtered navigation for normal sidebar display:
   * Searches ONLY currently visible + permitted items.
   */
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

  /**
   * Customizer tree representation:
   * Searches ALL permitted items (including hidden) so users can find and re-enable them.
   */
  readonly customizerTree = computed<NavCustomizerTree>(() => {
    const permitted = this.permittedEntries();
    const draftHidden = this.customizerDraftHidden();
    const query = this.customizerSearchTerm().trim().toLowerCase();

    const directItems: NavCustomizerGroupItem[] = [];
    const groups: NavCustomizerGroup[] = [];

    for (const entry of permitted) {
      if (entry.type === 'item') {
        const matches = !query || entry.item.label.toLowerCase().includes(query);
        if (matches) {
          directItems.push({
            id: entry.item.id,
            label: entry.item.label,
            route: entry.item.route,
            visible: !draftHidden.has(entry.item.id),
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

          groups.push({
            id: entry.group.id,
            label: entry.group.label,
            state,
            items,
          });
        }
      }
    }

    return { directItems, groups };
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
    this.customizerSearchTerm.set('');
    this.saveError.set(null);
    this.isCustomizerOpen.set(true);
  }

  closeCustomizer(): void {
    this.isCustomizerOpen.set(false);
    this.saveError.set(null);
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
    const group = this.customizerTree().groups.find((g) => g.id === groupId);
    if (!group) return;

    const current = new Set(this.customizerDraftHidden());
    if (group.state === 'checked') {
      // Uncheck all items in this group
      for (const item of group.items) {
        current.add(item.id);
      }
    } else {
      // Check all items in this group
      for (const item of group.items) {
        current.delete(item.id);
      }
    }
    this.customizerDraftHidden.set(current);
  }

  resetDraftToDefault(): void {
    this.customizerDraftHidden.set(new Set());
  }

  saveCustomizer(): void {
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.saveError.set(null);

    const hiddenIdsArray = [...this.customizerDraftHidden()];
    this.navigationApi.updatePreferences(hiddenIdsArray).subscribe({
      next: (response) => {
        this.hiddenItemIds.set(new Set(response.hiddenItemIds));
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
        this.hiddenItemIds.set(new Set(response.hiddenItemIds));
        this.isLoaded.set(true);
      },
      error: () => {
        // Fallback safely to all permitted navigation
        this.hiddenItemIds.set(new Set());
        this.isLoaded.set(true);
      },
    });
  }
}
