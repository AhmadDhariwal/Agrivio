export interface ReportCatalogItem {
  key: string;
  title: string;
  filters: string[];
  required: string[];
  exports: string[];
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportDataset {
  reportKey: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals: Record<string, string>;
  filters: Record<string, string | null>;
  summary?: Record<string, unknown>;
}
