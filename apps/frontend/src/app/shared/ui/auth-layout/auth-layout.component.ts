import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'agrivio-auth-layout',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './auth-layout.component.html',
})
export class AuthLayoutComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly headingId = `ag-auth-heading-${Math.random().toString(36).slice(2, 9)}`;
}
