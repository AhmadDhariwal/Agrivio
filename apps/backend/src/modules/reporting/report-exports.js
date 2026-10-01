const SOURCE_TYPE_LABELS = Object.freeze({
  account_opening: 'Account Opening Balance',
  customer_opening_receivable: 'Opening Receivable',
  customer_opening_advance: 'Opening Advance',
  supplier_opening_payable: 'Opening Payable',
  supplier_opening_advance: 'Opening Advance',
  supplier_payment: 'Supplier Payment',
  supplier_payments: 'Supplier Payments',
  supplier_payment_allocation: 'Payment to Supplier',
  supplier_payment_allocation_reversal: 'Payment to Supplier Reversal',
  supplier_payment_advance: 'Advance Paid to Supplier',
  supplier_payment_advance_reversal: 'Supplier Advance Reversal',
  supplier_advance_application: 'Advance Applied to Purchase',
  supplier_advance_consumption: 'Supplier Advance Consumed',
  supplier_advance_refund: 'Supplier Advance Refund',
  supplier_advance_refund_reversal: 'Supplier Advance Refund Reversal',
  supplier_payable_adjustment: 'Payable Adjustment',
  supplier_advance_adjustment: 'Advance Adjustment',
  supplier_balance_adjustment_reversal: 'Adjustment Reversal',
  purchase: 'Purchase Bill',
  purchase_payable: 'Purchase Payable',
  purchase_payment: 'Direct Purchase Payment',
  purchase_cancellation: 'Purchase Cancelled',
  purchase_cancellation_refund: 'Purchase Cancellation Refund',
  purchase_cancellation_advance_payable_reversal: 'Advance Application Reversed',
  purchase_cancellation_advance_reinstatement: 'Supplier Advance Restored',
  purchase_return: 'Purchase Return',
  purchase_return_refund: 'Purchase Return Refund',
  purchase_return_refund_reversal: 'Purchase Return Refund Reversal',
  customer_payment: 'Customer Payment',
  customer_payments: 'Customer Payments',
  customer_payment_allocation: 'Payment Received',
  customer_payment_allocation_reversal: 'Payment Received Reversal',
  customer_payment_advance: 'Customer Advance Received',
  customer_payment_advance_reversal: 'Customer Advance Reversal',
  customer_advance_consumption: 'Advance Consumed',
  customer_advance_application: 'Advance Applied to Sale',
  customer_loan_disbursement: 'Customer Loan Disbursement',
  customer_loan_repayment: 'Customer Loan Repayment',
  customer_loan_repayment_reversal: 'Customer Loan Repayment Reversal',
  customer_loan_reversal: 'Customer Loan Reversal',
  sale: 'Sale Invoice',
  sale_receivable: 'Sale Invoice',
  sale_cancellation: 'Sale Cancelled',
  sale_cancellation_refund: 'Sale Cancellation Refund',
  sale_cancellation_advance_reinstatement: 'Customer Advance Restored',
  sale_cancellation_advance_receivable_reversal: 'Advance Application Reversed',
  sales_return: 'Sales Return',
  sales_return_refund: 'Sales Return Refund',
  sales_return_refund_reversal: 'Sales Return Refund Reversal',
  account_transfer_in: 'Account Transfer In',
  account_transfer_out: 'Account Transfer Out',
  account_transfer_in_reversal: 'Transfer Reversal Out',
  account_transfer_out_reversal: 'Transfer Reversal In',
  manual_inflow: 'Add Money / Manual Inflow',
  manual_outflow: 'Withdraw Money / Manual Outflow',
  manual_inflow_reversal: 'Add Money Reversal',
  manual_outflow_reversal: 'Withdraw Money Reversal',
  balance_adjustment_increase: 'Balance Adjustment (Increase)',
  balance_adjustment_decrease: 'Balance Adjustment (Decrease)',
  balance_adjustment_increase_reversal: 'Adjustment Reversal (Increase)',
  balance_adjustment_decrease_reversal: 'Adjustment Reversal (Decrease)',
  expense: 'Expense Payment',
  expense_correction: 'Expense Correction',
  customer_payment_correction: 'Customer Payment Correction',
  supplier_payment_correction: 'Supplier Payment Correction',
  warehouse_transfer: 'Warehouse Transfer',
  adjustment: 'Stock Adjustment',
  opening_stock: 'Opening Stock',
});

const EFFECT_KIND_LABELS = Object.freeze({
  receivable: 'Receivable',
  payable: 'Payable',
  advance: 'Advance',
  payment: 'Payment',
  credit: 'Credit',
  debit: 'Debit',
  loan_receivable: 'Loan Receivable',
});

const ACCOUNT_TYPE_LABELS = Object.freeze({
  cash: 'Cash',
  bank: 'Bank',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
});

const DIRECTION_LABELS = Object.freeze({
  in: 'Inbound',
  out: 'Outbound',
});

const STATUS_LABELS = Object.freeze({
  posted: 'Posted',
  draft: 'Draft',
  cancelled: 'Cancelled',
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
});

const METRIC_LABELS = Object.freeze({
  netSalesRevenue: 'Net Sales Revenue',
  netCogs: 'Net Cost of Goods Sold (COGS)',
  grossProfit: 'Gross Profit',
  marginPercent: 'Margin (%)',
  cashInHand: 'Cash in Hand',
  bankBalances: 'Bank Balances',
  otherLiquidAccounts: 'Other Liquid Accounts',
  totalLiquidFunds: 'Total Liquid Funds',
  tradeReceivable: 'Trade Receivable',
  customerLoanReceivable: 'Customer Loan Receivable',
  customerAdvance: 'Customer Advance',
  netTradeExposure: 'Net Trade Exposure',
  totalCustomerExposure: 'Total Customer Exposure',
  supplierPayable: 'Supplier Payable',
  supplierAdvance: 'Supplier Advance',
  netSupplierPayable: 'Net Supplier Payable',
});

const MONEY_COLUMN_KEYS = new Set([
  'signedAmount',
  'runningBalance',
  'total',
  'paid',
  'receivable',
  'payable',
  'amount',
  'cogs',
  'revenue',
  'valuation',
  'debit',
  'credit',
  'balance',
]);

function humanizeSnake(str) {
  if (typeof str !== 'string' || !str) return '';
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function humanizeCamel(str) {
  if (typeof str !== 'string' || !str) return '';
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (l) => l.toUpperCase());
}

function formatIsoDateTime(str) {
  if (typeof str !== 'string') return str;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = months[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      let hours = d.getUTCHours();
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const hoursStr = String(hours).padStart(2, '0');
      return `${day} ${month} ${year}, ${hoursStr}:${mins} ${ampm}`;
    }
  }
  return str;
}

function displayCell(value, columnKey = '') {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (typeof value.amount === 'string') {
      return `${value.amount}${value.currency ? ` ${value.currency}` : ''}`;
    }
    if (typeof value.name === 'string') return value.name;
    return JSON.stringify(value);
  }
  const str = String(value);

  // Source Type
  if (columnKey === 'sourceType' || columnKey === 'source') {
    return SOURCE_TYPE_LABELS[str.toLowerCase()] ?? SOURCE_TYPE_LABELS[str] ?? humanizeSnake(str);
  }

  // Effect Kind
  if (columnKey === 'effectKind' || columnKey === 'kind') {
    return EFFECT_KIND_LABELS[str.toLowerCase()] ?? humanizeSnake(str);
  }

  // Account Type
  if (columnKey === 'accountType' || columnKey === 'type') {
    return ACCOUNT_TYPE_LABELS[str.toLowerCase()] ?? humanizeSnake(str);
  }

  // Direction
  if (columnKey === 'direction') {
    return DIRECTION_LABELS[str.toLowerCase()] ?? humanizeSnake(str);
  }

  // Status
  if (columnKey === 'status') {
    return STATUS_LABELS[str.toLowerCase()] ?? humanizeSnake(str);
  }

  // Metric
  if (columnKey === 'metric') {
    return METRIC_LABELS[str] ?? humanizeCamel(str);
  }

  // Shorten 24-character hexadecimal MongoDB ObjectIds in ID columns
  if (
    (columnKey === 'id' || columnKey === 'purchaseId' || columnKey === 'sourceId') &&
    /^[0-9a-fA-F]{24}$/.test(str)
  ) {
    return `#${str.slice(-6).toUpperCase()}`;
  }

  // ISO Timestamps
  if (
    ['postedAt', 'createdAt', 'occurredAt', 'timestamp'].includes(columnKey) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)
  ) {
    return formatIsoDateTime(str);
  }

  // Direct matches in dictionaries even if columnKey was not passed
  if (SOURCE_TYPE_LABELS[str.toLowerCase()]) return SOURCE_TYPE_LABELS[str.toLowerCase()];
  if (SOURCE_TYPE_LABELS[str]) return SOURCE_TYPE_LABELS[str];
  if (EFFECT_KIND_LABELS[str.toLowerCase()]) return EFFECT_KIND_LABELS[str.toLowerCase()];
  if (ACCOUNT_TYPE_LABELS[str.toLowerCase()]) return ACCOUNT_TYPE_LABELS[str.toLowerCase()];
  if (METRIC_LABELS[str]) return METRIC_LABELS[str];

  // If the string contains snake_case enum values (e.g. some_raw_code), humanize it
  if (/^[a-z]+(_[a-z0-9]+)+$/.test(str)) {
    return humanizeSnake(str);
  }

  return str;
}

function formatColumnHeaderLabel(col) {
  let label = col.label;
  if (!label) {
    label = col.key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (letter) => letter.toUpperCase());
  }
  if (MONEY_COLUMN_KEYS.has(col.key)) {
    if (!label.toLowerCase().includes('pkr') && !label.includes('(')) {
      return `${label} (PKR)`;
    }
  }
  return label;
}

function csvEscape(value, columnKey = '') {
  const text = displayCell(value, columnKey);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function flattenDatasetRows(dataset) {
  const sourceRows = dataset.rows ?? [];
  const rawColumns = dataset.columns?.length
    ? dataset.columns
    : Object.keys(sourceRows[0] ?? {}).map((key) => ({
        key,
        label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()),
      }));
  const columns = rawColumns.map((col) => ({
    key: col.key,
    label: formatColumnHeaderLabel(col),
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
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column.key], column.key)).join(','));
  return Buffer.from([header, ...body].join('\r\n'), 'utf8');
}

function xmlEscape(value, columnKey = '') {
  return displayCell(value, columnKey)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isNumericCell(rawVal) {
  if (typeof rawVal === 'number') return true;
  if (typeof rawVal === 'string') {
    const clean = rawVal.trim().replace(/,/g, '').replace(/\s*(Dr|Cr|PKR|USD|EUR)\s*$/i, '');
    return /^-?\d+(\.\d+)?$/.test(clean);
  }
  return false;
}

function cleanNumericValue(rawVal) {
  if (typeof rawVal === 'number') return String(rawVal);
  if (typeof rawVal === 'string') {
    const clean = rawVal.trim().replace(/,/g, '').replace(/\s*(Dr|Cr|PKR|USD|EUR)\s*$/i, '');
    if (/^-?\d+(\.\d+)?$/.test(clean)) return clean;
  }
  return String(rawVal);
}

function renderExcel(dataset) {
  const { columns, rows } = flattenDatasetRows(dataset);
  const title = dataset.title || dataset.reportKey || 'Report';
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  const colWidths = columns.map((col) => {
    let maxLen = col.label.length;
    for (const r of rows.slice(0, 50)) {
      const val = displayCell(r[col.key], col.key);
      if (val.length > maxLen) maxLen = Math.min(val.length, 35);
    }
    return Math.max(90, Math.min(260, maxLen * 7.5 + 20));
  });

  const columnTags = colWidths
    .map((w) => `<Column ss:Width="${Math.floor(w)}"/>`)
    .join('\n   ');

  const headerCells = columns
    .map((column) => {
      const isNum = ['total', 'amount', 'cogs', 'paid', 'receivable', 'payable', 'revenue', 'inventoryValue', 'quantity', 'count', 'debit', 'credit', 'balance', 'valuation', 'signedAmount', 'runningBalance'].includes(column.key);
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
          const textVal = displayCell(rawVal, column.key);
          const isNum = isNumericCell(rawVal);

          if (isTotalsRow) {
            if (isNum) {
              return `<Cell ss:StyleID="TotalNum"><Data ss:Type="Number">${cleanNumericValue(rawVal)}</Data></Cell>`;
            }
            return `<Cell ss:StyleID="TotalText"><Data ss:Type="String">${xmlEscape(textVal)}</Data></Cell>`;
          }

          if (isNum) {
            const style = isZebra ? 'CellNumZebra' : 'CellNum';
            return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${cleanNumericValue(rawVal)}</Data></Cell>`;
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
      ([, v]) => v !== null && v !== undefined && v !== ''
    );
    if (summaryEntries.length > 0) {
      const summaryCells = summaryEntries
        .slice(0, 6)
        .map(([k, v]) => {
          const keyLabel = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (l) => l.toUpperCase());
          const valStr = typeof v === 'object' && v.amount ? `${v.amount} ${v.currency || ''}`.trim() : displayCell(v, k);
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

function estimateTextWidth(text, fontSize = 8.5, isBold = false) {
  let w = 0;
  const scale = fontSize / 10;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') {
      w += (isBold ? 5.8 : 5.4) * scale;
    } else if (ch === '.' || ch === ',' || ch === ':' || ch === ';' || ch === '!' || ch === '|' || ch === "'") {
      w += 2.8 * scale;
    } else if (ch === ' ' || ch === '-') {
      w += 3.2 * scale;
    } else if (/[WMQ@]/.test(ch)) {
      w += (isBold ? 8.5 : 8.0) * scale;
    } else if (/[A-Z]/.test(ch)) {
      w += (isBold ? 6.8 : 6.2) * scale;
    } else if (/[ijlrt]/.test(ch)) {
      w += 3.2 * scale;
    } else {
      w += (isBold ? 5.4 : 5.0) * scale;
    }
  }
  return w;
}

function fitText(text, maxPixelWidth, fontSize = 8.5, isBold = false) {
  const sanitized = sanitizePdfText(text);
  if (estimateTextWidth(sanitized, fontSize, isBold) <= maxPixelWidth) {
    return sanitized;
  }
  let s = sanitized;
  while (s.length > 1 && estimateTextWidth(s + '...', fontSize, isBold) > maxPixelWidth) {
    s = s.slice(0, -1);
  }
  return s + '...';
}

function isNumericColumnKey(key, val) {
  if ([
    'total',
    'amount',
    'cogs',
    'paid',
    'receivable',
    'payable',
    'revenue',
    'inventoryValue',
    'quantity',
    'count',
    'debit',
    'credit',
    'balance',
    'valuation',
    'runningBalance',
    'signedAmount',
  ].includes(key)) {
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
  const marginBottom = 36;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Calculate column widths proportional to content
  const colWeights = columns.map((col) => {
    let maxLen = col.label.length;
    for (const r of rows.slice(0, 50)) {
      const val = displayCell(r[col.key], col.key);
      if (val.length > maxLen) maxLen = Math.min(val.length, 30);
    }
    return Math.max(maxLen, 7);
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
  const rightBoundary = marginLeft + contentWidth;

  const pages = [];
  let cmds = [];

  function drawBrandHeader(yTop) {
    // Top right: Agrivio Brand Block
    const brandW = 160;
    const brandX = rightBoundary - brandW;

    // Vector Emblem: Emerald rounded box with white sprout/leaf
    const emblemSize = 26;
    const emblemX = brandX;
    const emblemY = yTop - 26;
    cmds.push('0.06 0.48 0.32 rg');
    cmds.push(`${emblemX} ${emblemY} ${emblemSize} ${emblemSize} re f`);
    cmds.push('1 1 1 RG 1.5 w');
    cmds.push(`${emblemX + 6} ${emblemY + 6} m ${emblemX + 13} ${emblemY + 20} l S`);
    cmds.push(`${emblemX + 13} ${emblemY + 20} m ${emblemX + 20} ${emblemY + 14} l S`);
    cmds.push(`${emblemX + 13} ${emblemY + 13} m ${emblemX + 7} ${emblemY + 11} l S`);

    // Brand Name & Tagline
    cmds.push('0.06 0.10 0.18 rg');
    cmds.push(`BT /F2 16 Tf ${emblemX + 32} ${yTop - 13} Td (AGRIVIO) Tj ET`);
    cmds.push('0.35 0.40 0.48 rg');
    cmds.push(`BT /F2 6.5 Tf ${emblemX + 32} ${yTop - 23} Td (AGRICULTURAL COMMERCE) Tj ET`);

    // Emerald accent bar under brand
    cmds.push('0.06 0.48 0.32 RG 2 w');
    cmds.push(`${brandX} ${yTop - 30} m ${rightBoundary} ${yTop - 30} l S`);

    // Top left: Entity / Statement Details
    const entityTitle = dataset.filters?.customerName || dataset.filters?.supplierName || dataset.title || dataset.reportKey || 'Report';
    cmds.push('0.06 0.10 0.18 rg');
    cmds.push(`BT /F2 13 Tf ${marginLeft} ${yTop - 13} Td (${pdfEscape(fitText(entityTitle, 300, 13, true))}) Tj ET`);

    let leftSubY = yTop - 24;
    if (dataset.filters?.customerAddress) {
      cmds.push('0.35 0.40 0.48 rg');
      cmds.push(`BT /F1 8 Tf ${marginLeft} ${leftSubY} Td (${pdfEscape(fitText(dataset.filters.customerAddress, 300, 8))}) Tj ET`);
      leftSubY -= 11;
    } else {
      cmds.push('0.35 0.40 0.48 rg');
      cmds.push(`BT /F1 8 Tf ${marginLeft} ${leftSubY} Td (Agrivio Enterprise Business Statement) Tj ET`);
      leftSubY -= 11;
    }

    const reportRef = dataset.reportKey ? dataset.reportKey.toUpperCase().replace(/-/g, ' ') : 'ACCOUNT STATEMENT';
    cmds.push('0.45 0.50 0.58 rg');
    cmds.push(`BT /F1 7.5 Tf ${marginLeft} ${leftSubY} Td (Reference: ${pdfEscape(reportRef)}) Tj ET`);

    // Right-aligned Date Box (From / To) below brand bar
    const dateBoxX = rightBoundary - 130;
    let dateY = yTop - 44;

    const fromDate = dataset.filters?.fromDate || 'Beginning of Period';
    const toDate = dataset.filters?.toDate || new Date().toISOString().slice(0, 10);

    cmds.push('0.35 0.40 0.48 rg');
    cmds.push(`BT /F2 8 Tf ${dateBoxX} ${dateY} Td (From:) Tj ET`);
    cmds.push('0.06 0.10 0.18 rg');
    cmds.push(`BT /F1 8 Tf ${dateBoxX + 32} ${dateY} Td (${pdfEscape(fromDate)}) Tj ET`);

    dateY -= 12;
    cmds.push('0.35 0.40 0.48 rg');
    cmds.push(`BT /F2 8 Tf ${dateBoxX} ${dateY} Td (To:) Tj ET`);
    cmds.push('0.06 0.10 0.18 rg');
    cmds.push(`BT /F1 8 Tf ${dateBoxX + 32} ${dateY} Td (${pdfEscape(toDate)}) Tj ET`);

    return Math.min(leftSubY, dateY) - 16;
  }

  function drawTableHeader(y) {
    const headerHeight = 22;
    const headerY = y - headerHeight;

    // Header background: crisp slate-100 fill
    cmds.push('0.94 0.95 0.97 rg');
    cmds.push(`${marginLeft} ${headerY} ${contentWidth} ${headerHeight} re f`);

    // Outer and horizontal borders of header
    cmds.push('0.25 0.30 0.38 RG 1 w');
    cmds.push(`${marginLeft} ${y} m ${rightBoundary} ${y} l S`);
    cmds.push(`${marginLeft} ${headerY} m ${rightBoundary} ${headerY} l S`);

    // Header text & vertical lines
    cmds.push('0.08 0.12 0.20 rg');
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const w = colWidths[i];
      const maxTextW = w - 12;
      const text = fitText(col.label, maxTextW, 8.5, true);
      const isNum = isNumericColumnKey(col.key);
      const textW = estimateTextWidth(text, 8.5, true);
      const textX = isNum ? colX[i] + w - 6 - textW : colX[i] + 6;

      cmds.push(`BT /F2 8.5 Tf ${Math.floor(textX)} ${headerY + 7} Td (${pdfEscape(text)}) Tj ET`);

      // Vertical line on left of column
      cmds.push('0.25 0.30 0.38 RG 1 w');
      cmds.push(`${colX[i]} ${headerY} m ${colX[i]} ${y} l S`);
    }
    cmds.push(`${rightBoundary} ${headerY} m ${rightBoundary} ${y} l S`);

    return headerY;
  }

  let y = pageHeight - marginTop;
  y = drawBrandHeader(y);
  y = drawTableHeader(y);

  const rowHeight = 18;
  const hasTotals = Boolean(dataset.totals && Object.keys(dataset.totals).length > 0);

  if (rows.length === 0) {
    const rowY = y - rowHeight;
    cmds.push('0.98 0.99 1.0 rg');
    cmds.push(`${marginLeft} ${rowY} ${contentWidth} ${rowHeight} re f`);
    cmds.push('0.82 0.85 0.90 RG 0.5 w');
    cmds.push(`${marginLeft} ${rowY} m ${rightBoundary} ${rowY} l S`);
    cmds.push('0.55 0.60 0.68 rg');
    cmds.push(`BT /F1 8.5 Tf ${marginLeft + 12} ${rowY + 5} Td (No records found for this period) Tj ET`);
    cmds.push('0.82 0.85 0.90 RG 0.5 w');
    cmds.push(`${marginLeft} ${rowY} m ${marginLeft} ${y} l S`);
    cmds.push(`${rightBoundary} ${rowY} m ${rightBoundary} ${y} l S`);
    y = rowY;
  }

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const isTotalsRow = hasTotals && rIdx === rows.length - 1;

    // Page overflow check
    if (y - rowHeight < marginBottom + (isTotalsRow ? 40 : 25)) {
      cmds.push('0.25 0.30 0.38 RG 1 w');
      cmds.push(`${marginLeft} ${y} m ${rightBoundary} ${y} l S`);

      cmds.push('0.45 0.50 0.58 rg');
      cmds.push(`BT /F1 7.5 Tf ${marginLeft} 20 Td (Agrivio Business Management System  •  Confidential) Tj ET`);
      pages.push(cmds.join('\n'));

      cmds = [];
      y = pageHeight - marginTop;

      cmds.push('0.06 0.10 0.18 rg');
      cmds.push(`BT /F2 10 Tf ${marginLeft} ${y - 12} Td (${pdfEscape(dataset.title || dataset.reportKey || 'Report')} - Continued) Tj ET`);
      y -= 22;
      y = drawTableHeader(y);
    }

    const rowY = y - rowHeight;

    if (isTotalsRow) {
      cmds.push('0.92 0.94 0.97 rg');
      cmds.push(`${marginLeft} ${rowY} ${contentWidth} ${rowHeight} re f`);
    } else if (rIdx % 2 === 1) {
      cmds.push('0.98 0.99 1.0 rg');
      cmds.push(`${marginLeft} ${rowY} ${contentWidth} ${rowHeight} re f`);
    }

    // Horizontal bottom border of row
    if (isTotalsRow) {
      cmds.push('0.25 0.30 0.38 RG 1.5 w');
      cmds.push(`${marginLeft} ${rowY} m ${rightBoundary} ${rowY} l S`);
    } else {
      cmds.push('0.82 0.85 0.90 RG 0.5 w');
      cmds.push(`${marginLeft} ${rowY} m ${rightBoundary} ${rowY} l S`);
    }

    // Vertical grid lines for row
    const vertBorderColor = isTotalsRow ? '0.25 0.30 0.38 RG 1 w' : '0.82 0.85 0.90 RG 0.5 w';
    cmds.push(vertBorderColor);
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      cmds.push(`${colX[cIdx]} ${rowY} m ${colX[cIdx]} ${y} l S`);
    }
    cmds.push(`${rightBoundary} ${rowY} m ${rightBoundary} ${y} l S`);

    // Cell text
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      const rawVal = row[col.key];
      const valStr = displayCell(rawVal, col.key);
      const w = colWidths[cIdx];
      const isNum = isNumericColumnKey(col.key, rawVal);
      const fontTag = isTotalsRow ? '/F2 8.5 Tf' : '/F1 8.5 Tf';
      const textColor = isTotalsRow ? '0.05 0.08 0.14 rg' : '0.12 0.16 0.22 rg';
      const maxW = w - 12;
      const text = fitText(valStr, maxW, 8.5, isTotalsRow);
      const textW = estimateTextWidth(text, 8.5, isTotalsRow);
      const textX = isNum ? colX[cIdx] + w - 6 - textW : colX[cIdx] + 6;

      cmds.push(textColor);
      cmds.push(`BT ${fontTag} ${Math.floor(textX)} ${rowY + 5} Td (${pdfEscape(text)}) Tj ET`);
    }

    y = rowY;
  }

  // Draw Bottom-Right Summary Breakdown Box (matching statement reference)
  const summaryEntries = [];
  if (dataset.summary && Object.keys(dataset.summary).length > 0) {
    for (const [k, v] of Object.entries(dataset.summary)) {
      if (v !== null && v !== undefined && v !== '') {
        const label = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (l) => l.toUpperCase());
        const valStr = typeof v === 'object' && v.amount ? `${v.amount} ${v.currency || ''}`.trim() : displayCell(v, k);
        summaryEntries.push({ label, value: valStr });
      }
    }
  } else if (dataset.totals && Object.keys(dataset.totals).length > 0) {
    for (const [k, v] of Object.entries(dataset.totals)) {
      if (v !== null && v !== undefined && v !== '' && v !== 'Totals') {
        const col = columns.find((c) => c.key === k);
        const label = col ? `Total ${col.label}` : k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (l) => l.toUpperCase());
        summaryEntries.push({ label, value: String(v) });
      }
    }
  }

  if (summaryEntries.length > 0) {
    y -= 10;
    const boxW = Math.min(240, contentWidth * 0.55);
    const boxX = rightBoundary - boxW;
    const labelW = boxW - 90;
    const valueW = 90;
    const sRowHeight = 18;

    for (let sIdx = 0; sIdx < summaryEntries.length; sIdx++) {
      const item = summaryEntries[sIdx];
      const isLast = sIdx === summaryEntries.length - 1;
      const sY = y - sRowHeight;

      // Label (right-aligned to label cell)
      cmds.push('0.30 0.35 0.44 rg');
      const labelText = fitText(item.label, labelW - 10, 8.5, isLast);
      const labelTextW = estimateTextWidth(labelText, 8.5, isLast);
      const labelX = boxX + labelW - 8 - labelTextW;
      cmds.push(`BT ${isLast ? '/F2 8.5 Tf' : '/F1 8.5 Tf'} ${Math.floor(labelX)} ${sY + 5} Td (${pdfEscape(labelText)}) Tj ET`);

      // Value Box (enclosed in a border box, right-aligned)
      cmds.push(isLast ? '0.92 0.94 0.97 rg' : '0.97 0.98 0.99 rg');
      cmds.push(`${boxX + labelW} ${sY} ${valueW} ${sRowHeight} re f`);

      cmds.push(isLast ? '0.25 0.30 0.38 RG 1.5 w' : '0.75 0.80 0.86 RG 0.5 w');
      cmds.push(`${boxX + labelW} ${sY} ${valueW} ${sRowHeight} re s`);

      cmds.push('0.06 0.10 0.18 rg');
      const valText = fitText(item.value, valueW - 12, 8.5, true);
      const valTextW = estimateTextWidth(valText, 8.5, true);
      const valX = boxX + boxW - 6 - valTextW;
      cmds.push(`BT /F2 8.5 Tf ${Math.floor(valX)} ${sY + 5} Td (${pdfEscape(valText)}) Tj ET`);

      y = sY;
    }
  }

  // Final Page Footer
  cmds.push('0.45 0.50 0.58 rg');
  cmds.push(`BT /F1 7.5 Tf ${marginLeft} 20 Td (Agrivio Business Management System  •  Confidential) Tj ET`);
  pages.push(cmds.join('\n'));

  // Stamp page numbers across all pages
  const totalPages = pages.length;
  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageNumText = `Page ${pIdx + 1} of ${totalPages}`;
    const pageNumW = estimateTextWidth(pageNumText, 7.5);
    const pageNumCmd = `0.45 0.50 0.58 rg\nBT /F1 7.5 Tf ${Math.floor(rightBoundary - pageNumW)} 20 Td (${pdfEscape(pageNumText)}) Tj ET`;
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
