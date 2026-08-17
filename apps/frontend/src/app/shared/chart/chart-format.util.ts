export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

export interface ChartPoint {
  label: string;
  values: Record<string, number>;
}

export function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatPkrAmount(value: string | number | null | undefined): string {
  const parsed = parseAmount(value);
  if (!Number.isFinite(parsed)) {
    return 'Unavailable';
  }
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function formatQuantity(value: string | number | null | undefined): string {
  const parsed = parseAmount(value);
  if (!Number.isFinite(parsed)) {
    return 'Unavailable';
  }
  return new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 3,
  }).format(parsed);
}

export function maxSeriesValue(points: ChartPoint[], series: ChartSeries[]): number {
  let max = 0;
  for (const point of points) {
    for (const item of series) {
      max = Math.max(max, point.values[item.key] ?? 0);
    }
  }
  return max;
}

export function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padding: number,
  maxValue: number,
): string {
  if (values.length === 0) {
    return '';
  }
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const safeMax = maxValue > 0 ? maxValue : 1;
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (index / (values.length - 1)) * innerWidth;
      const y = padding + innerHeight - (Math.max(value, 0) / safeMax) * innerHeight;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function buildAreaPath(linePath: string, width: number, height: number, padding: number): string {
  if (!linePath) {
    return '';
  }
  const baseline = (height - padding).toFixed(2);
  const startX = linePath.match(/^M\s+([\d.]+)/)?.[1] ?? String(padding);
  const endMatch = linePath.match(/L\s+([\d.]+)\s+([\d.]+)$/);
  const endX = endMatch?.[1] ?? String(width - padding);
  return `${linePath} L ${endX} ${baseline} L ${startX} ${baseline} Z`;
}
