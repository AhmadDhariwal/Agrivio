import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';

@Component({
  selector: 'agrivio-feature-unavailable-page',
  standalone: true,
  imports: [RouterLink, UiEmptyStateComponent],
  templateUrl: './feature-unavailable.page.html',
})
export class FeatureUnavailablePage {}
