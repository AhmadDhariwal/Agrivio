import { Component, computed, input } from '@angular/core';
import { ChartPoint, ChartSeries, buildAreaPath, buildLinePath, maxSeriesValue } from './chart-format.util';

@Component({
  selector: 'agrivio-ui-line-chart',
  standalone: true,
  template: `
    @if (points().length === 0) {
      <p class="ag-muted">{{ emptyLabel() }}</p>
    } @else {
      <figure class="ag-chart" [attr.aria-label]="title()">
        <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" class="ag-chart__svg">
          @for (series of seriesList(); track series.key) {
            <path
              class="ag-chart__area"
              [attr.d]="areaPath(series.key)"
              [attr.fill]="series.color"
              opacity="0.18"
            />
            <path
              class="ag-chart__line"
              [attr.d]="linePath(series.key)"
              [attr.stroke]="series.color"
              fill="none"
              stroke-width="2.5"
            />
          }
        </svg>
        <figcaption class="ag-chart__legend">
          @for (series of seriesList(); track series.key) {
            <span><span class="ag-chart__swatch" [style.background]="series.color"></span>{{ series.label }}</span>
          }
        </figcaption>
        <ul class="ag-chart__labels">
          @for (point of points(); track point.label) {
            <li>{{ point.label }}</li>
          }
        </ul>
      </figure>
    }
  `,
  styles: [
    `
      .ag-chart {
        margin: 0;
      }
      .ag-chart__svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .ag-chart__legend,
      .ag-chart__labels {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1rem;
        margin: 0.5rem 0 0;
        padding: 0;
        list-style: none;
        font-size: var(--ag-text-xs);
        color: var(--ag-color-text-muted);
      }
      .ag-chart__legend span {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .ag-chart__swatch {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 999px;
      }
    `,
  ],
})
export class UiLineChartComponent {
  readonly title = input('Trend chart');
  readonly emptyLabel = input('No data in this range.');
  readonly points = input<ChartPoint[]>([]);
  readonly seriesList = input<ChartSeries[]>([]);
  readonly width = input(320);
  readonly height = input(160);
  readonly padding = input(12);

  readonly maxValue = computed(() => maxSeriesValue(this.points(), this.seriesList()));

  linePath(seriesKey: string): string {
    const values = this.points().map((point) => point.values[seriesKey] ?? 0);
    return buildLinePath(values, this.width(), this.height(), this.padding(), this.maxValue());
  }

  areaPath(seriesKey: string): string {
    return buildAreaPath(this.linePath(seriesKey), this.width(), this.height(), this.padding());
  }
}
