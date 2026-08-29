import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { QUERY_CACHE_TAGS } from '../../../shared/data-access/query-cache.tags';

export function invalidateReportsReads(queryCache: QueryCacheService): void {
  queryCache.invalidateTags(QUERY_CACHE_TAGS.reports);
}
