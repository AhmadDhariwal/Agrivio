import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-pagination',
  standalone: true,
  template: `
    @if (visible()) {
      <nav class="pagination" aria-label="Pagination" data-testid="pagination">
        <p class="pagination__range" aria-live="polite">
          {{ rangeStart() }}â€“{{ rangeEnd() }} of {{ total() }}
        </p>

        <label class="pagination__size">
          Rows per page
          <select
            [value]="pageSize()"
            [disabled]="disabled()"
            (change)="changePageSize($event)"
            data-testid="pagination-page-size"
          >
            @for (option of pageSizeOptions(); track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </label>

        @if (totalPages() > 1) {
          <div class="pagination__navigation">
            <button
              type="button"
              class="ag-btn ag-btn--secondary ag-btn--sm"
              [disabled]="disabled() || page() <= 1"
              (click)="goTo(page() - 1)"
              data-testid="pagination-previous"
            >
              Previous
            </button>

            @if (usePageSelect()) {
              <label class="pagination__page">
                Page
                <select
                  [value]="page()"
                  [disabled]="disabled()"
                  (change)="changePage($event)"
                  data-testid="pagination-page-select"
                >
                  @for (option of pageOptions(); track option) {
                    <option [value]="option">{{ option }}</option>
                  }
                </select>
                of {{ totalPages() }}
              </label>
            } @else {
              <label class="pagination__page">
                Page
                <input
                  type="number"
                  min="1"
                  [max]="totalPages()"
                  [value]="page()"
                  [disabled]="disabled()"
                  (change)="changePage($event)"
                  data-testid="pagination-page-input"
                />
                of {{ totalPages() }}
              </label>
            }

            <button
              type="button"
              class="ag-btn ag-btn--secondary ag-btn--sm"
              [disabled]="disabled() || page() >= totalPages()"
              (click)="goTo(page() + 1)"
              data-testid="pagination-next"
            >
              Next
            </button>
          </div>
        }
      </nav>
    }
  `,
  styleUrl: './ui-pagination.component.scss',
})
export class UiPaginationComponent {
  readonly page = input(1);
  readonly pageSize = input(25);
  readonly total = input(0);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);
  readonly disabled = input(false);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly visible = computed(() => this.total() > 10);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  readonly rangeEnd = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  readonly usePageSelect = computed(() => this.totalPages() <= 100);
  readonly pageOptions = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1),
  );

  goTo(nextPage: number): void {
    if (this.disabled()) {
      return;
    }
    const clamped = Math.min(this.totalPages(), Math.max(1, Math.trunc(nextPage)));
    if (clamped !== this.page()) {
      this.pageChange.emit(clamped);
    }
  }

  changePage(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    const nextPage = Number(target.value);
    if (Number.isInteger(nextPage)) {
      this.goTo(nextPage);
    }
  }

  changePageSize(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    const nextSize = Number(target.value);
    if (this.pageSizeOptions().includes(nextSize) && nextSize !== this.pageSize()) {
      this.pageSizeChange.emit(nextSize);
    }
  }
}
