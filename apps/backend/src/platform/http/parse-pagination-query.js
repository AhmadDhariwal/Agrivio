const { validationFailed } = require('../errors/app-error');

function parsePage(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw validationFailed('page must be a positive integer', [
      { field: 'page', message: 'page must be a positive integer' },
    ]);
  }
  return n;
}

function parsePageSize(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw validationFailed('pageSize must be a positive integer', [
      { field: 'pageSize', message: 'pageSize must be a positive integer' },
    ]);
  }
  if (n > 100) {
    throw validationFailed('pageSize must not exceed 100', [
      { field: 'pageSize', message: 'pageSize must not exceed 100' },
    ]);
  }
  return n;
}

function parsePaginationQuery(query) {
  const rawPage = query?.page;
  const rawSize = query?.pageSize;

  const page =
    rawPage === undefined || rawPage === '' || rawPage === null ? 1 : parsePage(rawPage);

  const pageSize =
    rawSize === undefined || rawSize === '' || rawSize === null ? 25 : parsePageSize(rawSize);

  return { page, pageSize, skip: (page - 1) * pageSize };
}

module.exports = { parsePaginationQuery };
