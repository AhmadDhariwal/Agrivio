import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { UiPaginationComponent } from './ui-pagination.component';

describe('UiPaginationComponent', () => {
  describe('Visibility Contract', () => {
    it('is hidden when total is 0', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 0);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeNull();
    });

    it('is hidden when total is 10 or fewer (at and below contract threshold)', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 10);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeNull();

      fixture.componentRef.setInput('total', 5);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeNull();
    });

    it('is visible when total is greater than 10', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 11);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).not.toBeNull();
    });
  });

  describe('Range Display Boundaries', () => {
    it('displays correct range for single page above 10 rows without navigation', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 18);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Showing 1–18 of 18');
      expect(fixture.nativeElement.querySelector('[data-testid="pagination-previous"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="pagination-next"]')).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="pagination-page-size"]'),
      ).not.toBeNull();
    });

    it('displays exact range for exact page-size boundary (e.g. 50 total with 25 page-size)', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 50);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Showing 1–25 of 50');

      fixture.componentRef.setInput('page', 2);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Showing 26–50 of 50');
    });

    it('displays correct range for non-divisible total (e.g. 841 total with 25 page-size)', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 841);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Showing 1–25 of 841');

      fixture.componentRef.setInput('page', 10);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Showing 226–250 of 841');

      fixture.componentRef.setInput('page', 34); // Last page: ceil(841/25) = 34
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Showing 826–841 of 841');
    });
  });

  describe('Navigation and Bounds', () => {
    it('disables Previous on first page and enables Next when multiple pages exist', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const previous = fixture.nativeElement.querySelector(
        '[data-testid="pagination-previous"]',
      ) as HTMLButtonElement;
      const next = fixture.nativeElement.querySelector(
        '[data-testid="pagination-next"]',
      ) as HTMLButtonElement;

      expect(previous.disabled).toBe(true);
      expect(next.disabled).toBe(false);
    });

    it('enables both Previous and Next on middle page', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 2);
      fixture.detectChanges();

      const previous = fixture.nativeElement.querySelector(
        '[data-testid="pagination-previous"]',
      ) as HTMLButtonElement;
      const next = fixture.nativeElement.querySelector(
        '[data-testid="pagination-next"]',
      ) as HTMLButtonElement;

      expect(previous.disabled).toBe(false);
      expect(next.disabled).toBe(false);
    });

    it('disables Next on last page and enables Previous', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 4);
      fixture.detectChanges();

      const previous = fixture.nativeElement.querySelector(
        '[data-testid="pagination-previous"]',
      ) as HTMLButtonElement;
      const next = fixture.nativeElement.querySelector(
        '[data-testid="pagination-next"]',
      ) as HTMLButtonElement;

      expect(previous.disabled).toBe(false);
      expect(next.disabled).toBe(true);
    });

    it('emits page changes when navigating with Previous and Next buttons', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 75);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 2);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

      const previous = fixture.nativeElement.querySelector(
        '[data-testid="pagination-previous"]',
      ) as HTMLButtonElement;
      const next = fixture.nativeElement.querySelector(
        '[data-testid="pagination-next"]',
      ) as HTMLButtonElement;

      previous.click();
      expect(emitted).toEqual([1]);

      next.click();
      expect(emitted).toEqual([1, 3]);
    });

    it('clamps page navigation between 1 and totalPages and prevents invalid page emissions', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 50);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

      // Attempt navigating below 1
      fixture.componentInstance.goTo(0);
      fixture.componentInstance.goTo(-5);
      expect(emitted).toEqual([]);

      // Navigate to valid page 2
      fixture.componentInstance.goTo(2);
      expect(emitted).toEqual([2]);

      // Attempt navigating beyond totalPages (2)
      fixture.componentRef.setInput('page', 2);
      fixture.componentInstance.goTo(3);
      fixture.componentInstance.goTo(999);
      expect(emitted).toEqual([2]); // No further emissions
    });
  });

  describe('Page Selection Modes (Dropdown vs Number Input)', () => {
    it('uses a select element when totalPages <= 100', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 2500); // 2500 / 25 = 100 pages
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('[data-testid="pagination-page-select"]');
      const input = fixture.nativeElement.querySelector('[data-testid="pagination-page-input"]');

      expect(select).not.toBeNull();
      expect(input).toBeNull();
    });

    it('uses a numeric input element when totalPages > 100', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 2525); // 2525 / 25 = 101 pages
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('[data-testid="pagination-page-select"]');
      const input = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-input"]',
      ) as HTMLInputElement;

      expect(select).toBeNull();
      expect(input).not.toBeNull();
      expect(input.min).toBe('1');
      expect(input.max).toBe('101');
    });

    it('emits page change from page select dropdown', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 75);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

      const select = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-select"]',
      ) as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));

      expect(emitted).toEqual([3]);
    });

    it('emits page change from page number input', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 5000);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 1);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

      const input = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-input"]',
      ) as HTMLInputElement;
      input.value = '42';
      input.dispatchEvent(new Event('change'));

      expect(emitted).toEqual([42]);
    });
  });

  describe('Page Size Changes', () => {
    it('reflects active page size in the rows-per-page select', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 50);
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-size"]',
      ) as HTMLSelectElement;
      expect(select.value).toBe('50');
    });

    it('emits pageSizeChange when a valid new size is selected', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageSizeChange.subscribe((s) => emitted.push(s));

      const select = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-size"]',
      ) as HTMLSelectElement;
      select.value = '100';
      select.dispatchEvent(new Event('change'));

      expect(emitted).toEqual([100]);
    });

    it('does not emit pageSizeChange if the same size is selected or size is unlisted', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageSizeChange.subscribe((s) => emitted.push(s));

      const select = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-size"]',
      ) as HTMLSelectElement;

      // Same size
      select.value = '25';
      select.dispatchEvent(new Event('change'));

      // Unlisted size
      select.value = '999';
      select.dispatchEvent(new Event('change'));

      expect(emitted).toEqual([]);
    });
  });

  describe('Disabled and Loading State Integrity', () => {
    it('disables all interactive elements when disabled is true', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 2);
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const previous = fixture.nativeElement.querySelector(
        '[data-testid="pagination-previous"]',
      ) as HTMLButtonElement;
      const next = fixture.nativeElement.querySelector(
        '[data-testid="pagination-next"]',
      ) as HTMLButtonElement;
      const pageSelect = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-select"]',
      ) as HTMLSelectElement;
      const pageSize = fixture.nativeElement.querySelector(
        '[data-testid="pagination-page-size"]',
      ) as HTMLSelectElement;

      expect(previous.disabled).toBe(true);
      expect(next.disabled).toBe(true);
      expect(pageSelect.disabled).toBe(true);
      expect(pageSize.disabled).toBe(true);
    });

    it('suppresses goTo emissions when disabled is true', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 100);
      fixture.componentRef.setInput('pageSize', 25);
      fixture.componentRef.setInput('page', 2);
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const emitted: number[] = [];
      fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));

      fixture.componentInstance.goTo(3);
      expect(emitted).toEqual([]);
    });
  });

  describe('Accessibility and Layout', () => {
    it('has nav container with aria-label="Pagination" and polite live region', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 50);
      fixture.detectChanges();

      const nav = fixture.nativeElement.querySelector('nav.pagination');
      expect(nav).not.toBeNull();
      expect(nav.getAttribute('aria-label')).toBe('Pagination');

      const range = fixture.nativeElement.querySelector('.pagination__range');
      expect(range.getAttribute('aria-live')).toBe('polite');
    });

    it('structures layout into 3 distinct zones (start, center, end)', () => {
      const fixture = TestBed.createComponent(UiPaginationComponent);
      fixture.componentRef.setInput('total', 50);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.pagination__zone--start')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.pagination__zone--center')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.pagination__zone--end')).not.toBeNull();
    });
  });
});
