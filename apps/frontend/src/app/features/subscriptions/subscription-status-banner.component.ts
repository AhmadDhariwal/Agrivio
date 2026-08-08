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
      <aside class="banner" [attr.data-tone]="current.tone" role="status">
        <strong>{{ current.title }}</strong>
        <p>{{ current.message }}</p>
        <p class="note">Informational only. Access is enforced by the server.</p>
      </aside>
    }
  `,
  styles: `
    .banner {
      display: grid;
      gap: 0.35rem;
      padding: 0.9rem 1rem;
      border-left: 4px solid #3f6f52;
      background: linear-gradient(120deg, #f3f7f4, #eef3f0);
      color: #1f2a24;
      margin-bottom: 1rem;
    }
    .banner[data-tone='warning'] {
      border-left-color: #b7791f;
      background: linear-gradient(120deg, #fff8eb, #f7f1e4);
    }
    .banner[data-tone='danger'] {
      border-left-color: #9b2c2c;
      background: linear-gradient(120deg, #fff5f5, #f8ecec);
    }
    .note {
      margin: 0;
      font-size: 0.85rem;
      opacity: 0.8;
    }
    strong,
    p {
      margin: 0;
    }
  `,
})
export class SubscriptionStatusBannerComponent {
  readonly accessState = input<SubscriptionAccessState | null>(null);
  readonly banner = computed(() => buildSubscriptionBanner(this.accessState()));
}
