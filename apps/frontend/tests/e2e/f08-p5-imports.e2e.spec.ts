import { expect, test } from '@playwright/test';
import { bootstrapF08Owner, spreadsheetMlWorkbook } from './f08-p5-support';

test.describe('F08 P5 imports', () => {
  test('preview/execute creates a category and invalid preview does not post', async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    await bootstrapF08Owner(page, request, stamp);
    const categoryName = `Imported Seed ${stamp}`;

    await page.getByTestId('nav-imports').click();
    await expect(page.getByTestId('imports-page')).toBeVisible();
    await page.getByTestId('import-type').selectOption('product_categories');

    await page.getByTestId('import-file').setInputFiles({
      name: 'invalid-categories.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: spreadsheetMlWorkbook('product_categories', [
        { name: 'Broken Row', productClass: '' },
      ]),
    });
    await page.getByTestId('import-preview-submit').click();
    await expect(page.getByTestId('import-execute')).toHaveCount(0);
    await expect(page.locator('[data-testid="import-errors"], .ag-alert--danger').first()).toBeVisible();

    await page.getByTestId('import-file').setInputFiles({
      name: 'categories.xls',
      mimeType: 'application/vnd.ms-excel',
      buffer: spreadsheetMlWorkbook('product_categories', [
        { name: categoryName, productClass: 'seed' },
      ]),
    });
    await page.getByTestId('import-preview-submit').click();
    await expect(page.getByTestId('import-counts')).toContainText('valid 1');
    await page.getByTestId('import-execute').click();
    await expect(page.getByText(/Imported 1 rows/)).toBeVisible();

    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page.getByTestId('categories-list')).toContainText(categoryName);
  });
});
