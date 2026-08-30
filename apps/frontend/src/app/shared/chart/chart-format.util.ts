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

export function formatCompactPkr(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = value / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return String(value);
}

export function formatDateTick(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthPart = parts[1];
    const dayPart = parts[2];
    if (monthPart && dayPart) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthIdx = parseInt(monthPart, 10) - 1;
      const day = parseInt(dayPart, 10);
      const month = months[monthIdx];
      if (month && !isNaN(day)) {
        return `${day} ${month}`;
      }
    }
  }
  return dateStr;
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
