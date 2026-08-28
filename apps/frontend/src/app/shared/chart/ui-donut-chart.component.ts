import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  input,
} from '@angular/core';
import { Chart } from 'chart.js/auto';
import { formatPkrAmount, parseAmount } from './chart-format.util';

export interface DonutSlice {
  label: string;
  value: string | number;
  color: string;
}

@Component({
  selector: 'agrivio-ui-donut-chart',
  standalone: true,
  template: `
    @if (slices().length === 0 || total() <= 0) {
      <div class="ag-donut__empty">
        <p class="ag-muted">{{ emptyLabel() }}</p>
      </div>
    } @else {
      <div class="ag-donut" [attr.aria-label]="title()">
        <div class="ag-donut__chart-wrap">
          <canvas #donutCanvas></canvas>
        </div>
        <div class="ag-donut__legend">
          @for (slice of formattedSlices(); track slice.label) {
            <div class="ag-donut__row">
              <div class="ag-donut__identity">
                <span class="ag-donut__swatch" [style.background]="slice.color"></span>
                <span class="ag-donut__label">{{ slice.label }}</span>
              </div>
              <div class="ag-donut__values">
                <span class="ag-donut__pct">{{ slice.percentage }}</span>
                <span class="ag-donut__val">{{ slice.formattedValue }}</span>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .ag-donut {
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
        min-height: 180px;

        @media (max-width: 599px) {
          flex-direction: column;
          align-items: center;
        }
      }
      .ag-donut__chart-wrap {
        position: relative;
        width: 130px;
        height: 130px;
        flex-shrink: 0;
      }
      .ag-donut__legend {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .ag-donut__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
      }
      .ag-donut__identity {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .ag-donut__swatch {
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        flex-shrink: 0;
      }
      .ag-donut__label {
        color: #334155;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ag-donut__values {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .ag-donut__pct {
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
        min-width: 38px;
        text-align: right;
      }
      .ag-donut__val {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
        min-width: 85px;
        text-align: right;
      }
      .ag-donut__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 180px;
        text-align: center;
      }
    `,
  ],
})
export class UiDonutChartComponent implements OnDestroy {
  @ViewChild('donutCanvas') donutCanvas?: ElementRef<HTMLCanvasElement>;

  readonly title = input('Distribution chart');
  readonly emptyLabel = input('No distribution data.');
  readonly slices = input<DonutSlice[]>([]);
  readonly valueFormatter = input<(value: string | number) => string>((value) => formatPkrAmount(value));

  private chart: Chart | null = null;

  readonly total = computed(() =>
    this.slices().reduce((sum, slice) => {
      const parsed = parseAmount(slice.value);
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0),
  );

  readonly formattedSlices = computed(() => {
    const totalVal = this.total();
    return this.slices().map((slice) => {
      const parsed = parseAmount(slice.value);
      const val = Number.isFinite(parsed) ? parsed : 0;
      const pct = totalVal > 0 ? (val / totalVal) * 100 : 0;
      return {
        label: slice.label,
        color: slice.color,
        formattedValue: this.valueFormatter()(slice.value),
        percentage: `${pct.toFixed(1)}%`,
      };
    });
  });

  constructor() {
    effect(() => {
      const currentSlices = this.slices();
      setTimeout(() => this.renderChart(currentSlices), 0);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private renderChart(slices: DonutSlice[]): void {
    if (!this.donutCanvas || slices.length === 0 || this.total() <= 0) {
      this.chart?.destroy();
      this.chart = null;
      return;
    }

    const ctx = this.donutCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart?.destroy();
    this.chart = null;

    const labels = slices.map((s) => s.label);
    const data = slices.map((s) => {
      const parsed = parseAmount(s.value);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    const backgroundColor = slices.map((s) => s.color);

    try {
      this.chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor,
              borderColor: '#ffffff',
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: {
                size: 12,
                family: "var(--ag-font-sans, 'Manrope', sans-serif)",
              },
              bodyFont: {
                size: 12,
                family: "var(--ag-font-sans, 'Manrope', sans-serif)",
              },
              padding: 10,
              cornerRadius: 6,
              callbacks: {
                label: (context) => ` ${context.label}: ${formatPkrAmount(context.parsed)}`,
              },
            },
          },
        },
      });
    } catch {
      // Graceful fallback for non-canvas environments
    }
  }
}
