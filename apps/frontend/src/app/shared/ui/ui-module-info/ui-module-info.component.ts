import { Component, OnInit, input, signal } from '@angular/core';

@Component({
  selector: 'agrivio-ui-module-info',
  standalone: true,
  templateUrl: './ui-module-info.component.html',
  styleUrl: './ui-module-info.component.scss',
})
export class UiModuleInfoComponent implements OnInit {
  readonly title = input<string>('About this module');
  readonly description = input.required<string>();
  readonly items = input<string[]>([]);
  readonly defaultExpanded = input<boolean>(false);

  readonly expanded = signal<boolean>(false);

  ngOnInit(): void {
    this.expanded.set(this.defaultExpanded());
  }

  toggleExpanded(): void {
    this.expanded.update((val) => !val);
  }
}
