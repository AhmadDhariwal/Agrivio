import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-pagination',
  standalone: true,
  templateUrl: './ui-pagination.component.html',
  styleUrl: './ui-pagination.component.scss',
})
export class UiPaginationComponent {
  readonly page = input(1);
  readonly pageSize = input(25);
  readonly total = input(0);
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);
  readonly disabled = input(false);
  readonly alwaysShowNavigation = input(false);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly visible = computed(() => this.total() > 10);
  readonly showNavigation = computed(
    () => this.alwaysShowNavigation() || this.totalPages() > 1,
  );
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
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
