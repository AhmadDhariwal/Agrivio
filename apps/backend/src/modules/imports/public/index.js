/**
 * Imports public contract (R1-F08-006).
 * Orchestrates target-module application interfaces; no foreign persistence writes.
 */

const { createImportsModule, createImportsService } = require('../imports.module');
const { listTemplates, IMPORT_TYPES, TEMPLATE_VERSION } = require('../import-templates');
const { renderImportWorkbook, parseImportWorkbook } = require('../import-workbook');

module.exports = {
  createImportsModule,
  createImportsService,
  listTemplates,
  IMPORT_TYPES,
  TEMPLATE_VERSION,
  renderImportWorkbook,
  parseImportWorkbook,
};
