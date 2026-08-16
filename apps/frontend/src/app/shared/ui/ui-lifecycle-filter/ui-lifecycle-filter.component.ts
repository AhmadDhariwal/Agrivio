import { Component, input, output } from '@angular/core';
import { MasterLifecycleFilter } from '../../lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-ui-lifecycle-filter',
  standalone: true,
  template: `
    <label class="ag-inline">
      Status
      <select
        [value]="value()"
        (change)="onChange($event)"
        data-testid="lifecycle-status-filter"
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
    </label>
  `,
})
export class UiLifecycleFilterComponent {
  readonly value = input<MasterLifecycleFilter>('all');
  readonly changed = output<MasterLifecycleFilter>();

  onChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    const next = target.value;
    if (next === 'all' || next === 'active' || next === 'inactive') {
      this.changed.emit(next);
    }
  }
}
