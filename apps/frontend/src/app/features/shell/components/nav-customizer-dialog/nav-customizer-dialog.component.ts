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
  templateUrl: './nav-customizer-dialog.component.html',
  styleUrl: './nav-customizer-dialog.component.scss',
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
