import { Component, inject } from '@angular/core';
import { NavigationService } from '../../data-access/navigation.service';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog/ui-dialog.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { UiCheckboxComponent } from '../../../../shared/ui/ui-checkbox/ui-checkbox.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';

@Component({
  selector: 'agrivio-nav-customizer-dialog',
  standalone: true,
  imports: [
    UiDialogComponent,
    UiSearchInputComponent,
    UiCheckboxComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
  ],
  template: `
    <agrivio-ui-dialog
      [open]="navService.isCustomizerOpen()"
      [closeOnBackdropClick]="false"
      [contained]="true"
      title="Customize Navigation"
      description="Choose which permitted modules appear, and drag to change their order."
      size="md"
      (dismiss)="navService.closeCustomizer()"
    >
      <div class="ag-nav-customizer">
        <div class="ag-nav-customizer__pinned">
          <div class="ag-nav-customizer__search">
            <agrivio-ui-search-input
              placeholder="Filter modules in customizer…"
              [value]="navService.customizerSearchTerm()"
              ariaLabel="Filter modules"
              (searchChange)="navService.setCustomizerSearchTerm($event)"
            />
          </div>

          <div class="ag-nav-customizer__toolbar">
            <button
              type="button"
              class="ag-btn ag-btn--ghost ag-btn--sm"
              (click)="navService.resetDraftToDefault()"
            >
              Reset to default
            </button>
          </div>

          @if (tree().isFiltered) {
            <p class="ag-muted ag-nav-customizer__hint">Clear search to reorder navigation.</p>
          }

          @if (navService.saveError(); as error) {
            <agrivio-ui-alert [message]="error" tone="danger" role="alert" />
          }
        </div>

        <div
          class="ag-nav-customizer__tree"
          role="group"
          aria-label="Customizable navigation items"
        >
          @if (tree().entries.length === 0) {
            <agrivio-ui-empty-state
              title="No modules found"
              message="No modules matched your search filter."
            />
          }

          @for (entry of tree().entries; track trackEntry($index, entry)) {
            @if (entry.type === 'item') {
              <div
                class="ag-nav-customizer__row"
                [class.ag-nav-customizer__row--drop]="dropTarget === entry.item.id"
                (dragover)="onGroupDragOver($event, entry.item.id)"
                (drop)="onGroupDrop($event, entry.item.id)"
                (dragleave)="onDragLeave(entry.item.id)"
              >
                <button
                  type="button"
                  class="ag-nav-customizer__handle"
                  [disabled]="tree().isFiltered"
                  draggable="true"
                  [attr.aria-label]="'Move ' + entry.item.label"
                  (dragstart)="onGroupDragStart($event, entry.item.id)"
                  (dragend)="onDragEnd()"
                  (keydown)="onGroupKeydown($event, entry.item.id)"
                >
                  <span aria-hidden="true">≡</span>
                </button>
                <agrivio-ui-checkbox
                  [id]="'chk-' + entry.item.id"
                  [checked]="entry.item.visible"
                  [label]="entry.item.label"
                  (checkedChange)="navService.toggleDraftItem(entry.item.id)"
                />
              </div>
            } @else {
              <div
                class="ag-nav-customizer__group"
                [class.ag-nav-customizer__row--drop]="dropTarget === entry.group.id"
                (dragover)="onGroupDragOver($event, entry.group.id)"
                (drop)="onGroupDrop($event, entry.group.id)"
                (dragleave)="onDragLeave(entry.group.id)"
              >
                <div class="ag-nav-customizer__group-header">
                  <button
                    type="button"
                    class="ag-nav-customizer__handle"
                    [disabled]="tree().isFiltered"
                    draggable="true"
                    [attr.aria-label]="'Move ' + entry.group.label"
                    (dragstart)="onGroupDragStart($event, entry.group.id)"
                    (dragend)="onDragEnd()"
                    (keydown)="onGroupKeydown($event, entry.group.id)"
                  >
                    <span aria-hidden="true">≡</span>
                  </button>
                  <agrivio-ui-checkbox
                    [id]="'chk-group-' + entry.group.id"
                    [checked]="entry.group.state === 'checked'"
                    [indeterminate]="entry.group.state === 'indeterminate'"
                    [label]="entry.group.label"
                    (checkedChange)="navService.toggleDraftGroup(entry.group.id)"
                  />
                </div>

                <div class="ag-nav-customizer__children">
                  @for (child of entry.group.items; track child.id) {
                    <div
                      class="ag-nav-customizer__child-row"
                      [class.ag-nav-customizer__row--drop]="dropTarget === child.id"
                      (dragover)="onChildDragOver($event, entry.group.id, child.id)"
                      (drop)="onChildDrop($event, entry.group.id, child.id)"
                      (dragleave)="onDragLeave(child.id)"
                    >
                      <button
                        type="button"
                        class="ag-nav-customizer__handle"
                        [disabled]="tree().isFiltered"
                        draggable="true"
                        [attr.aria-label]="'Move ' + child.label"
                        (dragstart)="onChildDragStart($event, entry.group.id, child.id)"
                        (dragend)="onDragEnd()"
                        (keydown)="onChildKeydown($event, entry.group.id, child.id)"
                      >
                        <span aria-hidden="true">≡</span>
                      </button>
                      <agrivio-ui-checkbox
                        [id]="'chk-' + child.id"
                        [checked]="child.visible"
                        [label]="child.label"
                        (checkedChange)="navService.toggleDraftItem(child.id)"
                      />
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
        <div class="ag-sr-only" aria-live="polite">{{ navService.reorderAnnouncement() }}</div>
      </div>

      <div dialog-actions class="ag-actions">
        <button
          type="button"
          class="ag-btn ag-btn--secondary"
          [disabled]="navService.isSaving()"
          (click)="navService.closeCustomizer()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="ag-btn ag-btn--primary"
          [disabled]="navService.isSaving()"
          (click)="navService.saveCustomizer()"
        >
          {{ navService.isSaving() ? 'Saving…' : 'Save preferences' }}
        </button>
      </div>
    </agrivio-ui-dialog>
  `,
  styles: [
    `
      .ag-nav-customizer {
        display: flex;
        flex-direction: column;
        gap: var(--ag-space-3);
        min-height: 0;
        flex: 1 1 auto;
        height: 100%;
      }

      .ag-nav-customizer__pinned {
        display: grid;
        gap: var(--ag-space-2);
        flex-shrink: 0;
      }

      .ag-nav-customizer__toolbar {
        display: flex;
        justify-content: flex-end;
        border-bottom: 1px solid var(--ag-color-border);
        padding-bottom: var(--ag-space-2);
      }

      .ag-nav-customizer__hint {
        margin: 0;
        font-size: var(--ag-text-xs);
      }

      .ag-nav-customizer__tree {
        display: grid;
        gap: var(--ag-space-2);
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: var(--ag-space-2);
        padding-bottom: var(--ag-space-8);
        scroll-padding-bottom: var(--ag-space-8);
        overscroll-behavior: contain;
      }

      .ag-nav-customizer__group {
        display: grid;
        gap: var(--ag-space-1);
        padding: var(--ag-space-2) var(--ag-space-3);
        background: var(--ag-color-surface-elevated);
        border: 1px solid var(--ag-color-border);
        border-radius: var(--ag-radius-md);
      }

      .ag-nav-customizer__group-header,
      .ag-nav-customizer__row,
      .ag-nav-customizer__child-row {
        display: flex;
        align-items: center;
        gap: var(--ag-space-2);
      }

      .ag-nav-customizer__group-header {
        font-weight: 600;
      }

      .ag-nav-customizer__children {
        display: grid;
        gap: var(--ag-space-1);
        padding-left: var(--ag-space-5);
        margin-top: var(--ag-space-1);
      }

      .ag-nav-customizer__row agrivio-ui-checkbox,
      .ag-nav-customizer__group-header agrivio-ui-checkbox,
      .ag-nav-customizer__child-row agrivio-ui-checkbox {
        flex: 1 1 auto;
        min-width: 0;
      }

      .ag-nav-customizer__row {
        padding: var(--ag-space-2) var(--ag-space-3);
        background: var(--ag-color-surface-elevated);
        border: 1px solid var(--ag-color-border);
        border-radius: var(--ag-radius-md);
      }

      .ag-nav-customizer__child-row {
        padding: var(--ag-space-1) 0;
      }

      .ag-nav-customizer__row--drop {
        outline: 2px solid var(--ag-color-primary);
        outline-offset: 1px;
      }

      .ag-nav-customizer__handle {
        flex-shrink: 0;
        width: 1.75rem;
        height: 1.75rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--ag-color-border);
        border-radius: var(--ag-radius-sm);
        background: var(--ag-color-surface);
        color: var(--ag-color-text-muted);
        cursor: grab;
        font-size: 1rem;
        line-height: 1;
      }

      .ag-nav-customizer__handle:focus-visible {
        outline: 2px solid var(--ag-color-primary);
        outline-offset: 2px;
        color: var(--ag-color-text);
      }

      .ag-nav-customizer__handle:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }

      .ag-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class NavCustomizerDialogComponent {
  readonly navService = inject(NavigationService);
  readonly tree = this.navService.customizerTree;
  dropTarget: string | null = null;
  private dragKind: 'group' | 'child' | null = null;
  private dragId: string | null = null;
  private dragGroupId: string | null = null;

  trackEntry(_index: number, entry: { type: string; item?: { id: string }; group?: { id: string } }): string {
    return entry.type === 'item' ? `item:${entry.item?.id}` : `group:${entry.group?.id}`;
  }

  onGroupDragStart(event: DragEvent, id: string): void {
    if (this.tree().isFiltered) {
      event.preventDefault();
      return;
    }
    this.dragKind = 'group';
    this.dragId = id;
    this.dragGroupId = null;
    event.dataTransfer?.setData('text/plain', id);
    event.dataTransfer?.setDragImage((event.currentTarget as HTMLElement), 8, 8);
  }

  onChildDragStart(event: DragEvent, groupId: string, id: string): void {
    if (this.tree().isFiltered) {
      event.preventDefault();
      return;
    }
    this.dragKind = 'child';
    this.dragId = id;
    this.dragGroupId = groupId;
    event.dataTransfer?.setData('text/plain', id);
    event.dataTransfer?.setDragImage((event.currentTarget as HTMLElement), 8, 8);
  }

  onGroupDragOver(event: DragEvent, targetId: string): void {
    if (this.dragKind !== 'group' || !this.dragId) return;
    event.preventDefault();
    this.dropTarget = targetId;
  }

  onChildDragOver(event: DragEvent, groupId: string, targetId: string): void {
    event.stopPropagation();
    if (this.dragKind !== 'child' || this.dragGroupId !== groupId || !this.dragId) return;
    event.preventDefault();
    this.dropTarget = targetId;
  }

  onGroupDrop(event: DragEvent, targetId: string): void {
    event.preventDefault();
    if (this.dragKind === 'group' && this.dragId) {
      this.navService.dropDraftGroup(this.dragId, targetId);
    }
    this.onDragEnd();
  }

  onChildDrop(event: DragEvent, groupId: string, targetId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragKind === 'child' && this.dragGroupId === groupId && this.dragId) {
      this.navService.dropDraftChild(groupId, this.dragId, targetId);
    }
    this.onDragEnd();
  }

  onDragLeave(id: string): void {
    if (this.dropTarget === id) {
      this.dropTarget = null;
    }
  }

  onDragEnd(): void {
    this.dragKind = null;
    this.dragId = null;
    this.dragGroupId = null;
    this.dropTarget = null;
  }

  onGroupKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navService.moveDraftGroup(id, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navService.moveDraftGroup(id, 1);
    }
  }

  onChildKeydown(event: KeyboardEvent, groupId: string, id: string): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.navService.moveDraftChild(groupId, id, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.navService.moveDraftChild(groupId, id, 1);
    }
  }
}
