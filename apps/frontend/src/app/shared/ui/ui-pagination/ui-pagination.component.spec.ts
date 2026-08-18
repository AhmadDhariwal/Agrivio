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
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1â€“18 of 18');
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-size"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-next"]')).toBeNull();
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

  it('uses a numeric go-to input instead of thousands of options for large totals', () => {
    const fixture = TestBed.createComponent(UiPaginationComponent);
    fixture.componentRef.setInput('total', 10_000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-input"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="pagination-page-select"]')).toBeNull();
  });
});
