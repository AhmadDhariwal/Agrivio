import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SubscriptionAccessState,
  buildSubscriptionBanner,
} from '../../data-access/subscription-access.util';
import { APP_PATHS } from '../../../../core/navigation/app-paths';

@Component({
  selector: 'agrivio-subscription-status-banner',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './subscription-status-banner.component.html',
  styleUrl: './subscription-status-banner.component.scss',
})
export class SubscriptionStatusBannerComponent {
  readonly billingRoute = APP_PATHS.billing;
  readonly accessState = input<SubscriptionAccessState | null>(null);
  readonly showManageBilling = input<boolean>(true);
  readonly banner = computed(() => buildSubscriptionBanner(this.accessState()));
}
