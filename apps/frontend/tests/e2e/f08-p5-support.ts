import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { bootstrapApprovedOwner, createBranchAndWarehouse } from './f07-p4-support';

export { API } from './e2e-origins';

export async function bootstrapF08Owner(
  page: Page,
  request: APIRequestContext,
  stamp: number,
): Promise<{ ownerEmail: string; organizationName: string }> {
  const organizationName = `F08 P5 Org ${stamp}`;
  const ownerEmail = `f08p5-${stamp}@example.com`;
  await bootstrapApprovedOwner(page, request, {
    organizationName,
    ownerEmail,
    displayName: 'F08 P5 Owner',
    entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
  });
  return { ownerEmail, organizationName };
}

export async function clickShellNav(
  page: Page,
  testId: string,
  urlPattern: RegExp,
  heading: string,
): Promise<void> {
  await page.getByTestId(testId).click();
  await expect(page).toHaveURL(urlPattern);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

export function spreadsheetMlWorkbook(importType: string, rows: Record<string, string>[]): Buffer {
  const headers = Object.keys(rows[0] ?? { name: '', productClass: '' });
  const metaCells = ['AGRIVIO_TEMPLATE', importType, '1']
    .map((value) => `<Cell><Data ss:Type="String">${value}</Data></Cell>`)
    .join('');
  const headerCells = headers
    .map((value) => `<Cell><Data ss:Type="String">${value}</Data></Cell>`)
    .join('');
  const dataRows = rows
    .map((row) => {
      const cells = headers
        .map((key) => `<Cell><Data ss:Type="String">${row[key] ?? ''}</Data></Cell>`)
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

export async function createCustomerWithReceivable(
  page: Page,
  name: string,
  amount: string,
): Promise<string> {
  await page.getByRole('link', { name: 'Customers' }).click();
  await page.getByTestId('customer-create-link').click();
  await page.getByTestId('customer-name').fill(name);
  await page.getByTestId('customer-type').selectOption('farmer');
  await page.getByTestId('customer-save').click();
  await expect(page.getByTestId('customers-list')).toContainText(name);
  await page.getByTestId('customers-list').getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByTestId('customer-opening-section')).toBeVisible();
  const customerId = page.url().split('/').pop() ?? '';
  await page.getByTestId('customer-opening-kind').selectOption('receivable');
  await page.getByTestId('customer-opening-amount').fill(amount);
  await page.getByTestId('customer-opening-save').click();
  await expect(page.getByTestId('customer-opening-posted')).toBeVisible();
  return customerId;
}

export { createBranchAndWarehouse };
