import { PaginationMeta } from '@agrivio/api-contracts';
import { WritableSignal } from '@angular/core';

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationSignals {
  total: WritableSignal<number>;
  pageSize?: WritableSignal<number>;
}

export function applyPaginationMeta(meta: PaginationMeta, signals: PaginationSignals): void {
  signals.total.set(meta.total);
  if (signals.pageSize && Number.isInteger(meta.pageSize) && meta.pageSize > 0) {
    signals.pageSize.set(meta.pageSize);
  }
}
