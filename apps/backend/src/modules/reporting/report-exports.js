function csvEscape(value) {
  const text = displayCell(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function displayCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (typeof value.amount === 'string') {
      return `${value.amount}${value.currency ? ` ${value.currency}` : ''}`;
    }
    if (typeof value.name === 'string') return value.name;
    return JSON.stringify(value);
  }
  return String(value);
}

function flattenDatasetRows(dataset) {
  const sourceRows = dataset.rows ?? [];
  const columns = dataset.columns?.length
    ? dataset.columns
    : Object.keys(sourceRows[0] ?? {}).map((key) => ({
        key,
        label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()),
      }));
  const rows = [...sourceRows];
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
  return displayCell(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isNumericCell(rawVal) {
  if (typeof rawVal === 'number') return true;
  if (typeof rawVal === 'string') {
    const clean = rawVal.trim().replace(/,/g, '');
    return /^-?\d+(\.\d+)?$/.test(clean);
  }
  return false;
}

function renderExcel(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);
  const title = dataset.title || dataset.reportKey || 'Report';
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const colWidths = columns.map((col) => {
    let maxLen = col.label.length;
    for (const r of rows.slice(0, 50)) {
      const val = displayCell(r[col.key]);
      if (val.length > maxLen) maxLen = Math.min(val.length, 35);
    }
    return Math.max(90, Math.min(260, maxLen * 7.5 + 20));
  });

  const columnTags = colWidths
    .map((w) => `<Column ss:Width="${Math.floor(w)}"/>`)
    .join('\n   ');

  const headerCells = columns
    .map((column) => {
      const isNum = ['total', 'amount', 'cogs', 'paid', 'receivable', 'payable', 'revenue', 'inventoryValue', 'quantity', 'count'].includes(column.key);
      const style = isNum ? 'HeaderNum' : 'Header';
      return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(column.label)}</Data></Cell>`;
    })
    .join('');

  const hasTotals = Boolean(dataset.totals && Object.keys(dataset.totals).length > 0);
  const dataRowsXml = rows
    .map((row, rIdx) => {
      const isTotalsRow = hasTotals && rIdx === rows.length - 1;
      const isZebra = !isTotalsRow && rIdx % 2 === 1;

      const cells = columns
        .map((column) => {
          const rawVal = row[column.key];
          const textVal = displayCell(rawVal);
          const isNum = isNumericCell(rawVal);

          if (isTotalsRow) {
            if (isNum) {
              return `<Cell ss:StyleID="TotalNum"><Data ss:Type="Number">${textVal}</Data></Cell>`;
            }
            return `<Cell ss:StyleID="TotalText"><Data ss:Type="String">${xmlEscape(textVal)}</Data></Cell>`;
          }

          if (isNum) {
            const style = isZebra ? 'CellNumZebra' : 'CellNum';
            return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${textVal}</Data></Cell>`;
          }

          const style = isZebra ? 'CellTextZebra' : 'CellText';
          return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(textVal)}</Data></Cell>`;
        })
        .join('');

      const height = isTotalsRow ? '22' : '19';
      return `<Row ss:Height="${height}">${cells}</Row>`;
    })
    .join('\n   ');

  let summaryRowsXml = '';
  if (dataset.summary && Object.keys(dataset.summary).length > 0) {
    const summaryEntries = Object.entries(dataset.summary).filter(
      ([k, v]) => v !== null && v !== undefined && v !== ''
    );
    if (summaryEntries.length > 0) {
      const summaryCells = summaryEntries
        .slice(0, 6)
        .map(([k, v]) => {
          const keyLabel = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (l) => l.toUpperCase());
          const valStr = typeof v === 'object' && v.amount ? `${v.amount} ${v.currency || ''}`.trim() : String(v);
          return `<Cell ss:StyleID="SummaryCard"><Data ss:Type="String">${xmlEscape(keyLabel)}: ${xmlEscape(valStr)}</Data></Cell>`;
        })
        .join('');
      summaryRowsXml = `<Row ss:Height="22">${summaryCells}</Row>\n   <Row ss:Height="8"/>`;
    }
  }

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#0F172A"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Subtitle">
   <Font ss:FontName="Calibri" ss:Size="9" ss:Italic="1" ss:Color="#64748B"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SummaryCard">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#1E293B"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="HeaderNum">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="CellText">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellTextZebra">
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellNum">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellNumZebra">
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalText">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#475569"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalNum">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#475569"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Report">
  <Table>
   ${columnTags}
   <Row ss:Height="26">
    <Cell ss:StyleID="Title"><Data ss:Type="String">${xmlEscape(title)}</Data></Cell>
   </Row>
   <Row ss:Height="16">
    <Cell ss:StyleID="Subtitle"><Data ss:Type="String">Generated: ${xmlEscape(nowStr)}</Data></Cell>
   </Row>
   <Row ss:Height="8"/>
   ${summaryRowsXml}
   <Row ss:Height="24">${headerCells}</Row>
   ${dataRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  return Buffer.from(xml, 'utf8');
}

function sanitizePdfText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '');
}

function pdfEscape(text) {
  return sanitizePdfText(text)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function truncateText(str, maxChars) {
  const s = sanitizePdfText(str);
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 3)) + '...';
}

function isNumericColumnKey(key, val) {
  if (['total', 'amount', 'cogs', 'paid', 'receivable', 'payable', 'revenue', 'inventoryValue', 'quantity', 'count'].includes(key)) {
    return true;
  }
  return isNumericCell(val);
}

function buildPdfDocument(pages, pageWidth, pageHeight) {
  const objects = [];
  function addObject(content) {
    objects.push(content);
    return objects.length;
  }

  const catalogId = addObject('');
  const pagesId = addObject('');
  const f1Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const f2Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageObjectIds = [];
  for (const pageContent of pages) {
    const streamBuffer = Buffer.from(pageContent, 'utf8');
    const contentId = addObject(
      `<< /Length ${streamBuffer.length} >>\nstream\n${pageContent}\nendstream`
    );
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${f1Id} 0 R /F2 ${f2Id} 0 R >> >> >>`
    );
    pageObjectIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let offset = 0;
  const header = '%PDF-1.4\n';
  offset += Buffer.byteLength(header, 'utf8');

  const xref = ['0000000000 65535 f \n'];
  const bodyParts = [header];

  for (let i = 0; i < objects.length; i++) {
    const objNum = i + 1;
    const str = `${objNum} 0 obj\n${objects[i]}\nendobj\n`;
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    bodyParts.push(str);
    offset += Buffer.byteLength(str, 'utf8');
  }

  const startXref = offset;
  const trailer = `xref\n0 ${objects.length + 1}\n${xref.join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  bodyParts.push(trailer);

  return Buffer.from(bodyParts.join(''), 'utf8');
}

function renderPdf(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);

  const isWide = columns.length > 6;
  const pageWidth = isWide ? 792 : 612;
  const pageHeight = isWide ? 612 : 792;
  const marginLeft = 36;
  const marginRight = 36;
  const marginTop = 36;
  const marginBottom = 40;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Calculate column widths
  const colWeights = columns.map((col) => {
    let maxLen = col.label.length;
    for (const r of rows.slice(0, 50)) {
      const val = displayCell(r[col.key]);
      if (val.length > maxLen) maxLen = Math.min(val.length, 30);
    }
    return Math.max(maxLen, 8);
  });
  const totalWeight = colWeights.reduce((a, b) => a + b, 0);
  const colWidths = colWeights.map((w) => Math.floor((w / totalWeight) * contentWidth));
  const sumWidths = colWidths.reduce((a, b) => a + b, 0);
  colWidths[colWidths.length - 1] += contentWidth - sumWidths;

  const colX = [];
  let currX = marginLeft;
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(currX);
    currX += colWidths[i];
  }

  const pages = [];
  let currentPageCommands = [];

  function drawHeader(y) {
    currentPageCommands.push('0.12 0.18 0.28 rg');
    currentPageCommands.push(`${marginLeft} ${y - 20} ${contentWidth} 20 re f`);

    currentPageCommands.push('1 1 1 rg');
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const w = colWidths[i];
      const maxChars = Math.max(3, Math.floor((w - 8) / 5.2));
      const text = truncateText(col.label, maxChars);
      const isNum = isNumericColumnKey(col.key);
      const textX = isNum ? colX[i] + w - 6 - text.length * 5.2 : colX[i] + 5;
      currentPageCommands.push(`BT /F2 8.5 Tf ${Math.floor(textX)} ${y - 14} Td (${pdfEscape(text)}) Tj ET`);
    }
    return y - 20;
  }

  let y = pageHeight - marginTop;

  // First page document title & timestamp
  currentPageCommands.push('0.09 0.15 0.24 rg');
  currentPageCommands.push(
    `BT /F2 16 Tf ${marginLeft} ${y - 16} Td (${pdfEscape(dataset.title || dataset.reportKey || 'Report')}) Tj ET`
  );
  currentPageCommands.push('0.45 0.50 0.55 rg');
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  currentPageCommands.push(
    `BT /F1 8 Tf ${pageWidth - marginRight - 140} ${y - 14} Td (Generated: ${nowStr}) Tj ET`
  );
  y -= 26;

  // Summary KPIs (if available)
  if (dataset.summary && Object.keys(dataset.summary).length > 0) {
    const summaryEntries = Object.entries(dataset.summary).filter(
      ([k, v]) => v !== null && v !== undefined && v !== ''
    );
    if (summaryEntries.length > 0) {
      const cardWidth = Math.min(
        140,
        Math.floor((contentWidth - (summaryEntries.length - 1) * 8) / summaryEntries.length)
      );
      for (let sIdx = 0; sIdx < summaryEntries.length; sIdx++) {
        const [k, v] = summaryEntries[sIdx];
        const cardX = marginLeft + sIdx * (cardWidth + 8);
        if (cardX + cardWidth <= marginLeft + contentWidth) {
          currentPageCommands.push('0.95 0.96 0.98 rg');
          currentPageCommands.push(`${cardX} ${y - 32} ${cardWidth} 32 re f`);
          currentPageCommands.push('0.85 0.88 0.92 RG 0.5 w');
          currentPageCommands.push(`${cardX} ${y - 32} ${cardWidth} 32 re s`);

          const keyLabel = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase();
          currentPageCommands.push('0.45 0.50 0.55 rg');
          currentPageCommands.push(
            `BT /F2 7 Tf ${cardX + 6} ${y - 12} Td (${pdfEscape(truncateText(keyLabel, 20))}) Tj ET`
          );

          const valStr =
            typeof v === 'object' && v.amount
              ? `${v.amount} ${v.currency || ''}`.trim()
              : String(v);
          currentPageCommands.push('0.09 0.15 0.24 rg');
          currentPageCommands.push(
            `BT /F2 10 Tf ${cardX + 6} ${y - 26} Td (${pdfEscape(truncateText(valStr, 18))}) Tj ET`
          );
        }
      }
      y -= 40;
    }
  }

  y = drawHeader(y);

  const rowHeight = 18;
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const isTotalsRow =
      rIdx === rows.length - 1 && dataset.totals && Object.keys(dataset.totals).length > 0;

    if (y - rowHeight < marginBottom + 16) {
      currentPageCommands.push('0.55 0.60 0.65 rg');
      currentPageCommands.push(
        `BT /F1 8 Tf ${marginLeft} 18 Td (Agrivio Business Management System) Tj ET`
      );
      pages.push(currentPageCommands.join('\n'));

      currentPageCommands = [];
      y = pageHeight - marginTop;

      currentPageCommands.push('0.3 0.35 0.4 rg');
      currentPageCommands.push(
        `BT /F2 9 Tf ${marginLeft} ${y - 10} Td (${pdfEscape(dataset.title || dataset.reportKey)} - Continued) Tj ET`
      );
      y -= 18;
      y = drawHeader(y);
    }

    if (isTotalsRow) {
      currentPageCommands.push('0.92 0.94 0.97 rg');
      currentPageCommands.push(`${marginLeft} ${y - rowHeight} ${contentWidth} ${rowHeight} re f`);
      currentPageCommands.push('0.55 0.60 0.68 RG 1 w');
      currentPageCommands.push(`${marginLeft} ${y} m ${marginLeft + contentWidth} ${y} l S`);
      currentPageCommands.push(
        `${marginLeft} ${y - rowHeight} m ${marginLeft + contentWidth} ${y - rowHeight} l S`
      );
    } else {
      if (rIdx % 2 === 1) {
        currentPageCommands.push('0.97 0.98 0.99 rg');
        currentPageCommands.push(
          `${marginLeft} ${y - rowHeight} ${contentWidth} ${rowHeight} re f`
        );
      }
      currentPageCommands.push('0.90 0.92 0.94 RG 0.5 w');
      currentPageCommands.push(
        `${marginLeft} ${y - rowHeight} m ${marginLeft + contentWidth} ${y - rowHeight} l S`
      );
    }

    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      const val = displayCell(row[col.key]);
      const w = colWidths[cIdx];
      const maxChars = Math.max(3, Math.floor((w - 8) / 4.8));
      const text = truncateText(val, maxChars);
      const isNum = isNumericColumnKey(col.key, row[col.key]);

      const fontTag = isTotalsRow ? '/F2 8.5 Tf' : '/F1 8 Tf';
      const textColor = isTotalsRow ? '0.05 0.10 0.18 rg' : '0.12 0.16 0.22 rg';
      const textX = isNum ? colX[cIdx] + w - 6 - text.length * 4.8 : colX[cIdx] + 5;

      currentPageCommands.push(textColor);
      currentPageCommands.push(
        `BT ${fontTag} ${Math.floor(textX)} ${y - 13} Td (${pdfEscape(text)}) Tj ET`
      );
    }

    y -= rowHeight;
  }

  currentPageCommands.push('0.55 0.60 0.65 rg');
  currentPageCommands.push(
    `BT /F1 8 Tf ${marginLeft} 18 Td (Agrivio Business Management System) Tj ET`
  );
  pages.push(currentPageCommands.join('\n'));

  const totalPages = pages.length;
  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageNumText = `Page ${pIdx + 1} of ${totalPages}`;
    const pageNumCmd = `BT /F1 8 Tf ${pageWidth - marginRight - 60} 18 Td (${pdfEscape(pageNumText)}) Tj ET`;
    pages[pIdx] += `\n${pageNumCmd}`;
  }

  return buildPdfDocument(pages, pageWidth, pageHeight);
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
