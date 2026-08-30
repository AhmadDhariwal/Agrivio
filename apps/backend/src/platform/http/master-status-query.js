const { validationFailed } = require('../errors/app-error');

function parseMasterStatusQuery(query) {
  const raw = typeof query?.status === 'string' ? query.status.trim() : '';
  if (raw === '' || raw === 'all') {
    return undefined;
  }
  if (raw === 'active' || raw === 'inactive') {
    return raw;
  }
  throw validationFailed('status must be active, inactive, or all', [
    { field: 'status', message: 'status must be active, inactive, or all' },
  ]);
}

function filterByMasterStatus(items, status) {
  if (status !== 'active' && status !== 'inactive') {
    return items;
  }
  return items.filter((item) => String(item.status) === status);
}

module.exports = {
  parseMasterStatusQuery,
  filterByMasterStatus,
};
