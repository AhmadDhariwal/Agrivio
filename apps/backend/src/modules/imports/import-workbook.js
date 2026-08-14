const { inflateRawSync } = require('node:zlib');
const { validationFailed } = require('../../platform/errors/app-error');
const { getTemplate, TEMPLATE_VERSION } = require('./import-templates');

const META_MARKER = 'AGRIVIO_TEMPLATE';

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderImportWorkbook(importType, rows, version = TEMPLATE_VERSION) {
  const template = getTemplate(importType);
  if (template === null) {
    throw new Error(`Unknown import type ${importType}`);
  }
  const headers = template.columns.map((column) => column.key);
  const metaCells = [META_MARKER, importType, String(version)]
    .map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
    .join('');
  const headerCells = headers
    .map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
    .join('');
  const dataRows = rows
    .map((row) => {
      const cells = headers
        .map((key) => `<Cell><Data ss:Type="String">${xmlEscape(row[key] ?? '')}</Data></Cell>`)
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  return Buffer.from(
    `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Import">
  <Table>
   <Row>${metaCells}</Row>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`,
    'utf8',
  );
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function parseSpreadsheetMl(buffer) {
  const xml = buffer.toString('utf8');
  const rowMatches = [...xml.matchAll(/<Row>([\s\S]*?)<\/Row>/g)];
  return rowMatches.map((match) => {
    const cells = [...match[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map((cell) =>
      decodeXmlEntities(cell[1]).trim(),
    );
    return cells;
  });
}

function columnIndexFromRef(ref) {
  const letters = String(ref).replace(/[0-9]/g, '');
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseSharedStrings(xml) {
  const strings = [];
  const items = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
  for (const item of items) {
    const texts = [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) =>
      decodeXmlEntities(match[1]),
    );
    strings.push(texts.join(''));
  }
  return strings;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowMatches = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
  for (const rowMatch of rowMatches) {
    const cells = [];
    const cellMatches = [...rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];
    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1];
      const ref = (attrs.match(/r="([A-Z]+[0-9]+)"/) ?? [])[1];
      const type = (attrs.match(/t="([^"]+)"/) ?? [])[1];
      const valueMatch = cellMatch[2].match(/<v>([\s\S]*?)<\/v>/);
      let value = valueMatch ? decodeXmlEntities(valueMatch[1]) : '';
      if (type === 's') {
        value = sharedStrings[Number(value)] ?? '';
      }
      const index = ref ? columnIndexFromRef(ref) : cells.length;
      cells[index] = String(value).trim();
    }
    rows.push(cells.map((cell) => cell ?? ''));
  }
  return rows;
}

function readZipEntries(buffer) {
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    if (flags & 8) {
      throw validationFailed('Unsupported Excel zip data descriptor');
    }
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compSize);
    let content = compressed;
    if (method === 8) {
      content = inflateRawSync(compressed);
    } else if (method !== 0) {
      throw validationFailed('Unsupported Excel compression method');
    }
    entries[name] = content;
    offset = dataStart + compSize;
  }
  return entries;
}

function parseXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const sharedXml = entries['xl/sharedStrings.xml'];
  const sheetXml = entries['xl/worksheets/sheet1.xml'];
  if (!sheetXml) {
    throw validationFailed('Excel workbook is missing the first worksheet');
  }
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml.toString('utf8')) : [];
  return parseSheetRows(sheetXml.toString('utf8'), sharedStrings);
}

function parseWorkbookGrid(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw validationFailed('Workbook is empty');
  }
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return parseXlsx(buffer);
  }
  return parseSpreadsheetMl(buffer);
}

function mapRows(grid, expectedType) {
  if (grid.length < 2) {
    throw validationFailed('Workbook is missing template metadata or headers', [
      { field: 'workbook', message: 'Row 1 must identify AGRIVIO_TEMPLATE, type, and version' },
    ]);
  }
  const meta = grid[0];
  if (String(meta[0] ?? '').trim() !== META_MARKER) {
    throw validationFailed('Workbook template marker is missing', [
      { field: 'workbook', code: 'TEMPLATE_MARKER_MISSING', message: 'Cell A1 must be AGRIVIO_TEMPLATE' },
    ]);
  }
  const templateType = String(meta[1] ?? '').trim();
  const templateVersion = Number(String(meta[2] ?? '').trim());
  if (templateType !== expectedType) {
    throw validationFailed('Template type does not match this import job', [
      {
        field: 'templateType',
        code: 'TEMPLATE_TYPE_MISMATCH',
        message: `Expected ${expectedType}, found ${templateType || '(blank)'}`,
      },
    ]);
  }
  const template = getTemplate(expectedType);
  if (template === null || templateVersion !== template.version) {
    throw validationFailed('Template version is not supported', [
      {
        field: 'templateVersion',
        code: 'TEMPLATE_VERSION_MISMATCH',
        message: `Expected version ${template?.version ?? TEMPLATE_VERSION}, found ${String(meta[2] ?? '')}`,
      },
    ]);
  }

  const header = grid[1].map((value) => String(value ?? '').trim());
  const errors = [];
  const required = template.columns.filter((column) => column.required).map((column) => column.key);
  for (const key of required) {
    if (!header.includes(key)) {
      errors.push({
        row: 2,
        field: key,
        code: 'COLUMN_MISSING',
        message: `Required column ${key} is missing`,
      });
    }
  }
  for (const name of header) {
    if (name !== '' && !template.columns.some((column) => column.key === name)) {
      errors.push({
        row: 2,
        field: name,
        code: 'COLUMN_UNKNOWN',
        message: `Unknown column ${name} is not part of ${expectedType} v${template.version}`,
      });
    }
  }

  const records = [];
  for (let index = 2; index < grid.length; index += 1) {
    const cells = grid[index];
    const isEmpty = cells.every((cell) => String(cell ?? '').trim() === '');
    if (isEmpty) {
      continue;
    }
    const record = {};
    header.forEach((key, columnIndex) => {
      if (key) {
        record[key] = String(cells[columnIndex] ?? '').trim();
      }
    });
    records.push({ rowNumber: index + 1, values: record });
  }

  return {
    templateType,
    templateVersion,
    createUpdatePolicy: template.createUpdatePolicy,
    headerErrors: errors,
    records,
  };
}

function parseImportWorkbook(buffer, expectedType) {
  return mapRows(parseWorkbookGrid(buffer), expectedType);
}

module.exports = {
  META_MARKER,
  parseImportWorkbook,
  renderImportWorkbook,
};
