import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { UiPaginationComponent } from './ui-pagination.component';

describe('UiPaginationComponent', () => {
  it('hides for ten or fewer rows', async () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 10);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination"]')).toBeNull();
  });

  it('shows the range and page-size control without navigation for one page above ten rows', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 18);
    fixture.componentRef.setInput('pageSize', 25);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Showing 1–18 of 18');
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-size"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-next"]')).toBeNull();
  });

  it('reflects the active page size in the rows-per-page select', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 37);
    fixture.componentRef.setInput('pageSize', 25);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector(
      '[data-testid="pagination-page-size"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe('25');
    expect(fixture.nativeElement.textContent).toContain('Showing 1–25 of 37');
  });

  it('emits page changes and disables navigation at the bounds', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 61);
    fixture.componentRef.setInput('page', 1);
    fixture.detectChanges();
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));
    const previous = fixture.nativeElement.querySelector('[data-testid="pagination-previous"]');
    const next = fixture.nativeElement.querySelector('[data-testid="pagination-next"]');
    expect(previous.disabled).toBe(true);
    next.click();
    expect(emitted).toEqual([2]);
  });

  it('emits page-size changes from the rows-per-page select', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 37);
    fixture.componentRef.setInput('pageSize', 25);
    fixture.detectChanges();
    const emitted: number[] = [];
    fixture.componentInstance.pageSizeChange.subscribe((size) => emitted.push(size));
    const select = fixture.nativeElement.querySelector(
      '[data-testid="pagination-page-size"]',
    ) as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    expect(emitted).toEqual([10]);
  });

  it('uses a numeric go-to input instead of thousands of options for large totals', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 10_000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-input"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-select"]')).toBeNull();
  });

  it('uses a three-zone footer layout', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 37);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pagination__zone--start')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.pagination__zone--center')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.pagination__zone--end')).not.toBeNull();
  });
});
