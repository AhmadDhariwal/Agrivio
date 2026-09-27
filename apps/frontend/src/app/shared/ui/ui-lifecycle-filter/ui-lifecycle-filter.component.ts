import { Component, input, output } from '@angular/core';
import { MasterLifecycleFilter } from '../../lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-ui-lifecycle-filter',
  standalone: true,
  templateUrl: './ui-lifecycle-filter.component.html',
})
export class UiLifecycleFilterComponent {
  readonly value = input<MasterLifecycleFilter>('active');
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
