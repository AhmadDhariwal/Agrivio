import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SubscriptionAccessState,
  buildSubscriptionBanner,
} from '../../data-access/subscription-access.util';

@Component({
  selector: 'agrivio-subscription-status-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (banner(); as current) {
      <aside
        class="sub-banner"
        [class.sub-banner--warning]="current.tone === 'warning'"
        [class.sub-banner--danger]="current.tone === 'danger'"
        [class.sub-banner--info]="current.tone === 'info'"
        [attr.data-tone]="current.tone"
        role="status"
      >
        <div class="sub-banner__content">
          <span class="sub-banner__dot" aria-hidden="true"></span>
          <strong class="sub-banner__title">{{ current.title }}</strong>
          <span class="sub-banner__sep">·</span>
          <span class="sub-banner__message">{{ current.message }}</span>
          <span class="sub-banner__note">(Informational only)</span>
        </div>
        <a class="sub-banner__link" routerLink="/app/subscriptions/billing">Manage billing →</a>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .sub-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 40px;
      padding: 8px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 13px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);

      &--info {
        background: #f0fdf4;
        border-color: #bbf7d0;
        color: #166534;
      }

      &--warning {
        background: #fffbeb;
        border-color: #fde68a;
        color: #92400e;
      }

      &--danger {
        background: #fef2f2;
        border-color: #fecaca;
        color: #991b1b;
      }

      &__content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        min-width: 0;
      }

      &__dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }

      &__title {
        font-weight: 600;
        color: #0f172a;
      }

      &__sep {
        color: #94a3b8;
      }

      &__message {
        color: #334155;
      }

      &__note {
        font-size: 11px;
        color: #64748b;
      }

      &__link {
        font-size: 12px;
        font-weight: 600;
        color: #065f46;
        text-decoration: none;
        white-space: nowrap;
        flex-shrink: 0;

        &:hover {
          text-decoration: underline;
        }
      }
    }
  `,
})
export class SubscriptionStatusBannerComponent {
  readonly accessState = input<SubscriptionAccessState | null>(null);
  readonly banner = computed(() => buildSubscriptionBanner(this.accessState()));
}

