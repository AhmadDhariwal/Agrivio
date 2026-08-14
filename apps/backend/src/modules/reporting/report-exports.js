function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function flattenDatasetRows(dataset) {
  const columns = dataset.columns ?? [];
  const rows = [...(dataset.rows ?? [])];
  if (dataset.totals && Object.keys(dataset.totals).length > 0) {
    const totalsRow = {};
    for (const column of columns) {
      totalsRow[column.key] = dataset.totals[column.key] ?? '';
    }
    if (columns[0] && (totalsRow[columns[0].key] === '' || totalsRow[columns[0].key] === undefined)) {
      totalsRow[columns[0].key] = 'Totals';
    }
    rows.push(totalsRow);
  }
  return { columns, rows };
}

function renderCsv(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(','));
  return Buffer.from([header, ...body].join('\r\n'), 'utf8');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderExcel(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);
  const headerCells = columns
    .map((column) => `<Cell><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`)
    .join('');
  const dataRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<Cell><Data ss:Type="String">${xmlEscape(row[column.key])}</Data></Cell>`)
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Report">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
  return Buffer.from(xml, 'utf8');
}

function pdfEscape(text) {
  return String(text ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function renderPdf(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);
  const lines = [`${dataset.title ?? dataset.reportKey}`];
  if (dataset.summary) {
    for (const [key, value] of Object.entries(dataset.summary)) {
      if (value && typeof value === 'object' && typeof value.amount === 'string') {
        lines.push(`${key}: ${value.amount} ${value.currency ?? ''}`.trim());
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
  }
  lines.push(columns.map((column) => column.label).join(' | '));
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column.key] ?? '')).join(' | '));
  }

  const content = lines
    .map((line, index) => {
      const y = 780 - index * 14;
      return `BT /F1 10 Tf 40 ${y} Td (${pdfEscape(line.slice(0, 120))}) Tj ET`;
    })
    .join('\n');
  const stream = Buffer.from(content, 'utf8');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let offset = 9;
  const xref = ['0000000000 65535 f '];
  const bodyParts = ['%PDF-1.4\n'];
  for (const object of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n `);
    bodyParts.push(`${object}\n`);
    offset += Buffer.byteLength(`${object}\n`, 'utf8');
  }
  const xrefStart = offset;
  const pdf = `${bodyParts.join('')}xref\n0 ${objects.length + 1}\n${xref.join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function renderExport(dataset, format) {
  if (format === 'csv') {
    return {
      buffer: renderCsv(dataset),
      contentType: 'text/csv; charset=utf-8',
      filename: `${dataset.reportKey}.csv`,
    };
  }
  if (format === 'excel') {
    return {
      buffer: renderExcel(dataset),
      contentType: 'application/vnd.ms-excel',
      filename: `${dataset.reportKey}.xls`,
    };
  }
  if (format === 'pdf') {
    return {
      buffer: renderPdf(dataset),
      contentType: 'application/pdf',
      filename: `${dataset.reportKey}.pdf`,
    };
  }
  const { validationFailed } = require('../../platform/errors/app-error');
  throw validationFailed('Unsupported export format', [
    { field: 'format', message: 'format must be pdf, excel, or csv' },
  ]);
}

module.exports = {
  flattenDatasetRows,
  renderCsv,
  renderExcel,
  renderExport,
  renderPdf,
};
