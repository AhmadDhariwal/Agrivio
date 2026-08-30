import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCompactPkr, parseAmount } from './chart-format.util';

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
      <div class="ag-hbar-empty">
        <p class="ag-muted">{{ emptyLabel() }}</p>
      </div>
    } @else {
      <div class="ag-hbar-chart" [attr.aria-label]="title()">
        <div class="ag-hbar-chart__list">
          @for (item of items(); track item.label) {
            <div class="ag-hbar-chart__item">
              <div class="ag-hbar-chart__meta">
                <div class="ag-hbar-chart__label-wrap">
                  @if (item.href) {
                    <a [routerLink]="item.href" class="ag-hbar-chart__link" [title]="item.label">
                      {{ item.label }}
                    </a>
                  } @else {
                    <span class="ag-hbar-chart__name" [title]="item.label">{{ item.label }}</span>
                  }
                </div>
                <div class="ag-hbar-chart__values">
                  @if (item.detail) {
                    <span class="ag-hbar-chart__detail">{{ item.detail }}</span>
                  } @else {
                    <span class="ag-hbar-chart__value">{{ formatValue(item.value) }}</span>
                  }
                </div>
              </div>
              <div class="ag-hbar-chart__track" aria-hidden="true">
                <span class="ag-hbar-chart__bar" [style.width.%]="barWidth(item.value)"></span>
              </div>
            </div>
          }
        </div>

        @if (scaleTicks().length > 0) {
          <div class="ag-hbar-chart__scale" aria-hidden="true">
            @for (tick of scaleTicks(); track tick.label) {
              <span class="ag-hbar-chart__tick" [style.left.%]="tick.percent">{{ tick.label }}</span>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .ag-hbar-chart {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }
      .ag-hbar-chart__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ag-hbar-chart__item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ag-hbar-chart__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 12.5px;
      }
      .ag-hbar-chart__label-wrap {
        min-width: 0;
        flex: 1;
      }
      .ag-hbar-chart__link {
        font-weight: 500;
        color: #065f46;
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;

        &:hover {
          text-decoration: underline;
        }
      }
      .ag-hbar-chart__name {
        font-weight: 500;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
      }
      .ag-hbar-chart__values {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .ag-hbar-chart__detail {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      .ag-hbar-chart__value {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      .ag-hbar-chart__track {
        height: 5px;
        border-radius: 9999px;
        background: #f1f5f9;
        overflow: hidden;
      }
      .ag-hbar-chart__bar {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #3b82f6;
        transition: width 0.3s ease;
      }
      .ag-hbar-chart__scale {
        position: relative;
        height: 16px;
        margin-top: 4px;
        border-top: 1px dashed #e2e8f0;
      }
      .ag-hbar-chart__tick {
        position: absolute;
        top: 2px;
        transform: translateX(-50%);
        font-size: 10.5px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .ag-hbar-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 180px;
        text-align: center;
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
    return max > 0 ? max : 1;
  });

  readonly scaleTicks = computed(() => {
    const max = this.maxValue();
    if (max <= 1) return [];
    return [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
      percent: fraction * 100,
      label: formatCompactPkr(Math.round(max * fraction)),
    }));
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
