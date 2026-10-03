import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ACCESS_DENIED_MESSAGE } from '../../../../core/access/authorization-error';

@Component({
  selector: 'agrivio-access-denied-page',
  standalone: true,
  imports: [RouterLink, UiEmptyStateComponent],
  templateUrl: './access-denied.page.html',
})
export class AccessDeniedPage {
  readonly message = ACCESS_DENIED_MESSAGE;
}
