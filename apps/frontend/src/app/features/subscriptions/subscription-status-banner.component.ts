import { Component, computed, input } from '@angular/core';
import {
  SubscriptionAccessState,
  buildSubscriptionBanner,
} from './subscription-access.util';

@Component({
  selector: 'agrivio-subscription-status-banner',
  standalone: true,
  template: `
    @if (banner(); as current) {
      <aside
        class="ag-alert"
        [class.ag-alert--warning]="current.tone === 'warning'"
        [class.ag-alert--danger]="current.tone === 'danger'"
        [class.ag-alert--info]="current.tone === 'info'"
        [attr.data-tone]="current.tone"
        role="status"
        style="margin-bottom: 1rem"
      >
        <strong>{{ current.title }}</strong>
        <p>{{ current.message }}</p>
        <p class="ag-muted" style="font-size: 0.85rem; margin: 0">
          Informational only. Access is enforced by the server.
        </p>
      </aside>
    }
  `,
})
export class SubscriptionStatusBannerComponent {
  readonly accessState = input<SubscriptionAccessState | null>(null);
  readonly banner = computed(() => buildSubscriptionBanner(this.accessState()));
}
