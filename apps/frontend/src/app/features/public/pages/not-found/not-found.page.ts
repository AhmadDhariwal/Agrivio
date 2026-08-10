import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'agrivio-not-found-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="ag-auth-layout">
      <section class="ag-auth-panel ag-stack">
        <p class="ag-page-header__eyebrow">404</p>
        <h1>Page not found</h1>
        <p class="ag-muted">
          That route is not part of the current Agrivio workspace. Check the address or return to a
          known page.
        </p>
        <div class="ag-actions">
          <a routerLink="/" class="ag-btn ag-btn--primary">Go to landing</a>
          <a routerLink="/login" class="ag-btn ag-btn--secondary">Sign in</a>
        </div>
      </section>
    </div>
  `,
})
export class NotFoundPage {}
