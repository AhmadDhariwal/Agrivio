import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-page-header',
  standalone: true,
  template: `
    <header class="ag-page-header">
      @if (eyebrow()) {
        <p class="ag-page-header__eyebrow">{{ eyebrow() }}</p>
      }
      <h1>{{ title() }}</h1>
      @if (lede()) {
        <p class="ag-page-header__lede">{{ lede() }}</p>
      }
      <ng-content />
    </header>
  `,
})
export class UiPageHeaderComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input<string | null>(null);
  readonly lede = input<string | null>(null);
}
