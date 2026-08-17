import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parseAmount } from './chart-format.util';

export interface HorizontalBarItem {
  label: string;
  value: string | number;
  detail?: string;
  href?: string | null;
}

@Component({
  selector: 'agrivio-ui-horizontal-bar-chart',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (items().length === 0) {
      <p class="ag-muted">{{ emptyLabel() }}</p>
    } @else {
      <ul class="ag-hbar-chart" [attr.aria-label]="title()">
        @for (item of items(); track item.label) {
          <li class="ag-hbar-chart__row">
            <div class="ag-hbar-chart__meta">
              @if (item.href) {
                <a [routerLink]="item.href">{{ item.label }}</a>
              } @else {
                <span>{{ item.label }}</span>
              }
              <span class="ag-hbar-chart__value">{{ formatValue(item.value) }}</span>
            </div>
            <div class="ag-hbar-chart__track" aria-hidden="true">
              <span class="ag-hbar-chart__bar" [style.width.%]="barWidth(item.value)"></span>
            </div>
            @if (item.detail) {
              <span class="ag-muted ag-hbar-chart__detail">{{ item.detail }}</span>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .ag-hbar-chart {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      .ag-hbar-chart__meta {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        font-size: var(--ag-text-sm);
      }
      .ag-hbar-chart__value {
        font-variant-numeric: tabular-nums;
      }
      .ag-hbar-chart__track {
        height: 0.55rem;
        border-radius: 999px;
        background: var(--ag-color-surface-elevated);
        overflow: hidden;
      }
      .ag-hbar-chart__bar {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--ag-color-primary);
      }
      .ag-hbar-chart__detail {
        font-size: var(--ag-text-xs);
      }
    `,
  ],
})
export class UiHorizontalBarChartComponent {
  readonly title = input('Horizontal bar chart');
  readonly emptyLabel = input('No rows to display.');
  readonly items = input<HorizontalBarItem[]>([]);
  readonly valueFormatter = input<(value: string | number) => string>((value) => String(value));

  readonly maxValue = computed(() => {
    let max = 0;
    for (const item of this.items()) {
      const parsed = parseAmount(item.value);
      if (Number.isFinite(parsed)) {
        max = Math.max(max, parsed);
      }
    }
    return max;
  });

  barWidth(value: string | number): number {
    const parsed = parseAmount(value);
    const max = this.maxValue();
    if (!Number.isFinite(parsed) || max <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((parsed / max) * 100));
  }

  formatValue(value: string | number): string {
    return this.valueFormatter()(value);
  }
}
