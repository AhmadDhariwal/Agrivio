import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
} from '@angular/core';
import { Chart } from 'chart.js/auto';
import {
  ChartPoint,
  ChartSeries,
  formatCompactPkr,
  formatDateTick,
  formatPkrAmount,
} from './chart-format.util';

function hexToRgba(hex: string, alpha = 1): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    return hex;
  }
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt((cleanHex[0] || '0') + (cleanHex[0] || '0'), 16);
    const g = parseInt((cleanHex[1] || '0') + (cleanHex[1] || '0'), 16);
    const b = parseInt((cleanHex[2] || '0') + (cleanHex[2] || '0'), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleanHex.length >= 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

@Component({
  selector: 'agrivio-ui-line-chart',
  standalone: true,
  template: `
    @if (points().length === 0) {
      <div class="ag-chart__empty">
        <p class="ag-muted">{{ emptyLabel() }}</p>
      </div>
    } @else {
      <div class="ag-chart-container" [attr.aria-label]="title()">
        <canvas #chartCanvas></canvas>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .ag-chart-container {
        position: relative;
        width: 100%;
        height: 230px;
      }
      .ag-chart__empty {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 180px;
        text-align: center;
      }
    `,
  ],
})
export class UiLineChartComponent implements OnDestroy {
  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  readonly title = input('Trend chart');
  readonly emptyLabel = input('No data in this range.');
  readonly points = input<ChartPoint[]>([]);
  readonly seriesList = input<ChartSeries[]>([]);

  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const pts = this.points();
      const series = this.seriesList();
      // Ensure change detection runs before canvas access
      setTimeout(() => this.renderChart(pts, series), 0);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private renderChart(points: ChartPoint[], seriesList: ChartSeries[]): void {
    if (!this.chartCanvas || points.length === 0 || seriesList.length === 0) {
      this.chart?.destroy();
      this.chart = null;
      return;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart?.destroy();
    this.chart = null;

    const labels = points.map((p) => formatDateTick(p.label));
    const datasets = seriesList.map((series) => {
      const color = series.color || '#065f46';
      const bgColor = hexToRgba(color, 0.08);
      return {
        label: `${series.label} (Rs)`,
        data: points.map((p) => p.values[series.key] ?? 0),
        borderColor: color,
        backgroundColor: bgColor,
        borderWidth: 2.2,
        tension: 0.35,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
      };
    });

    try {
      this.chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              align: 'start',
              labels: {
                usePointStyle: true,
                boxWidth: 8,
                boxHeight: 8,
                pointStyle: 'circle',
                font: {
                  size: 12,
                  family: "var(--ag-font-sans, 'Manrope', sans-serif)",
                  weight: 'bold',
                },
                color: '#475569',
                padding: 12,
              },
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
                label: (context) =>
                  ` ${context.dataset.label}: ${formatPkrAmount(context.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              ticks: {
                font: {
                  size: 11,
                  family: "var(--ag-font-sans, 'Manrope', sans-serif)",
                },
                color: '#64748b',
                maxRotation: 0,
              },
              border: {
                display: false,
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: '#f1f5f9',
              },
              ticks: {
                font: {
                  size: 11,
                  family: "var(--ag-font-sans, 'Manrope', sans-serif)",
                },
                color: '#64748b',
                callback: (value) => formatCompactPkr(Number(value)),
              },
              border: {
                display: false,
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
