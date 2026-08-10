import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'agrivio-auth-layout',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="ag-auth-layout">
      <section class="ag-auth-panel" [attr.aria-labelledby]="headingId">
        <div class="ag-auth-brand">
          <a routerLink="/" class="ag-auth-brand__mark">Agrivio</a>
          <h1 [id]="headingId">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="ag-muted">{{ subtitle() }}</p>
          }
        </div>
        <ng-content />
      </section>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly headingId = `ag-auth-heading-${Math.random().toString(36).slice(2, 9)}`;
}
