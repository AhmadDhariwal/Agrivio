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
  templateUrl: './ui-horizontal-bar-chart.component.html',
  styleUrl: './ui-horizontal-bar-chart.component.scss',
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
