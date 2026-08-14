import { expect, type Page } from '@playwright/test';

export async function assertControlHasAccessibleName(page: Page, testId: string): Promise<void> {
  const control = page.getByTestId(testId);
  await expect(control).toBeVisible();
  const named = await control.evaluate((node) => {
    const element = node as HTMLElement;
    if (element.getAttribute('aria-label')) {
      return true;
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy && document.getElementById(labelledBy)) {
      return true;
    }
    const id = element.getAttribute('id');
    if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) {
      return true;
    }
    return Boolean(element.closest('label'));
  });
  expect(named, `${testId} must have a programmatic name`).toBe(true);
}

export async function assertVisibleFocus(page: Page): Promise<void> {
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) {
      return { tag: null, boxShadow: '', outline: '' };
    }
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      boxShadow: style.boxShadow,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
    };
  });
  expect(focused.tag).toBeTruthy();
  const hasRing = focused.boxShadow !== 'none' && focused.boxShadow !== '';
  const hasOutline = !focused.outline.startsWith('none');
  expect(hasRing || hasOutline, 'focused control must show a visible focus indication').toBe(true);
}

export async function assertPageHasHeading(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}
