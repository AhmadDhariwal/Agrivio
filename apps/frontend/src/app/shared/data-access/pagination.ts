import { PaginationMeta } from '@agrivio/api-contracts';

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
