import { Component, computed, input } from '@angular/core';
import { parseAmount } from './chart-format.util';

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
      <p class="ag-muted">{{ emptyLabel() }}</p>
    } @else {
      <figure class="ag-donut" [attr.aria-label]="title()">
        <svg viewBox="0 0 120 120" role="img" class="ag-donut__svg">
          @for (segment of segments(); track segment.label) {
            <circle
              class="ag-donut__segment"
              cx="60"
              cy="60"
              r="42"
              fill="transparent"
              [attr.stroke]="segment.color"
              stroke-width="16"
              [attr.stroke-dasharray]="segment.dashArray"
              [attr.stroke-dashoffset]="segment.dashOffset"
              transform="rotate(-90 60 60)"
            />
          }
        </svg>
        <figcaption class="ag-donut__legend">
          @for (slice of slices(); track slice.label) {
            <span>
              <span class="ag-donut__swatch" [style.background]="slice.color"></span>
              {{ slice.label }} — {{ formatValue(slice.value) }}
            </span>
          }
        </figcaption>
      </figure>
    }
  `,
  styles: [
    `
      .ag-donut {
        margin: 0;
        display: grid;
        gap: 0.75rem;
      }
      .ag-donut__svg {
        width: 8.5rem;
        height: 8.5rem;
      }
      .ag-donut__legend {
        display: grid;
        gap: 0.35rem;
        font-size: var(--ag-text-sm);
      }
      .ag-donut__legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .ag-donut__swatch {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 999px;
      }
    `,
  ],
})
export class UiDonutChartComponent {
  readonly title = input('Distribution chart');
  readonly emptyLabel = input('No distribution data.');
  readonly slices = input<DonutSlice[]>([]);
  readonly valueFormatter = input<(value: string | number) => string>((value) => String(value));

  readonly total = computed(() =>
    this.slices().reduce((sum, slice) => {
      const parsed = parseAmount(slice.value);
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0),
  );

  readonly segments = computed(() => {
    const circumference = 2 * Math.PI * 42;
    const total = this.total();
    let offset = 0;
    return this.slices().map((slice) => {
      const parsed = parseAmount(slice.value);
      const value = Number.isFinite(parsed) ? parsed : 0;
      const fraction = total > 0 ? value / total : 0;
      const length = fraction * circumference;
      const segment = {
        label: slice.label,
        color: slice.color,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: String(-offset),
      };
      offset += length;
      return segment;
    });
  });

  formatValue(value: string | number): string {
    return this.valueFormatter()(value);
  }
}
