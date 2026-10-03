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
  templateUrl: './ui-donut-chart.component.html',
  styleUrl: './ui-donut-chart.component.scss',
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
