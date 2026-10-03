import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-page-header',
  standalone: true,
  templateUrl: './ui-page-header.component.html',
})
export class UiPageHeaderComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input<string | null>(null);
  readonly lede = input<string | null>(null);
}
