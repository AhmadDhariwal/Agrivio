const { recordInUse } = require('../errors/app-error');

function assertMasterUnused(reasons) {
  const labels = (reasons ?? []).filter((item) => typeof item === 'string' && item.trim() !== '');
  if (labels.length === 0) {
    return;
  }
  throw recordInUse(
    'This record cannot be deleted because it is referenced by business history. Deactivate it instead.',
    labels.map((message) => ({ field: 'references', message })),
  );
}

module.exports = {
  assertMasterUnused,
};
