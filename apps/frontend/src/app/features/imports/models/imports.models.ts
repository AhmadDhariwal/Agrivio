export interface ImportTemplateColumn {
  key: string;
  required: boolean;
}

export interface ImportTemplate {
  importType: string;
  version: number;
  createUpdatePolicy: string;
  columns: ImportTemplateColumn[];
}

export interface ImportRowError {
  row: number;
  field: string;
  code?: string;
  message: string;
}

export interface ImportJob {
  id: string;
  importType: string;
  templateVersion: number;
  status: string;
  preview: {
    templateType: string;
    templateVersion: number;
    createUpdatePolicy: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
  } | null;
  result: {
    createdCount: number;
  } | null;
  failureMessage: string | null;
  errors?: ImportRowError[];
  createUpdatePolicy?: string;
}
