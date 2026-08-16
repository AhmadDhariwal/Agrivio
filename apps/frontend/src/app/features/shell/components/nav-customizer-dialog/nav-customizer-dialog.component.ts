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
      title="Customize Navigation"
      description="Choose which permitted modules and tools appear in your navigation."
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

          @if (navService.saveError(); as error) {
            <agrivio-ui-alert [message]="error" tone="danger" role="alert" />
          }
        </div>

        <div class="ag-nav-customizer__tree" role="group" aria-label="Customizable navigation items">
          @if (tree().directItems.length === 0 && tree().groups.length === 0) {
            <agrivio-ui-empty-state
              title="No modules found"
              message="No modules matched your search filter."
            />
          }

          @for (item of tree().directItems; track item.id) {
            <div class="ag-nav-customizer__row">
              <agrivio-ui-checkbox
                [id]="'chk-' + item.id"
                [checked]="item.visible"
                [label]="item.label"
                (checkedChange)="navService.toggleDraftItem(item.id)"
              />
            </div>
          }

          @for (group of tree().groups; track group.id) {
            <div class="ag-nav-customizer__group">
              <div class="ag-nav-customizer__group-header">
                <agrivio-ui-checkbox
                  [id]="'chk-group-' + group.id"
                  [checked]="group.state === 'checked'"
                  [indeterminate]="group.state === 'indeterminate'"
                  [label]="group.label"
                  (checkedChange)="navService.toggleDraftGroup(group.id)"
                />
              </div>

              <div class="ag-nav-customizer__children">
                @for (child of group.items; track child.id) {
                  <div class="ag-nav-customizer__child-row">
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
        </div>
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

      .ag-nav-customizer__tree {
        display: grid;
        gap: var(--ag-space-2);
        flex: 1 1 auto;
        min-height: 0;
        max-height: clamp(14rem, 45vh, 24rem);
        overflow-y: auto;
        padding-right: var(--ag-space-2);
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

      .ag-nav-customizer__group-header {
        font-weight: 600;
      }

      .ag-nav-customizer__children {
        display: grid;
        gap: var(--ag-space-1);
        padding-left: var(--ag-space-5);
        margin-top: var(--ag-space-1);
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
    `,
  ],
})
export class NavCustomizerDialogComponent {
  readonly navService = inject(NavigationService);
  readonly tree = this.navService.customizerTree;
}
