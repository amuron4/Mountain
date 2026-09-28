import { expect, test } from '@playwright/test';

test('PWA: manifest と Service Worker によりオフラインでも起動できる', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);

  // SW がインストールされ、ページを制御するまで待つ
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
  await expect(page.getByTestId('stats')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
  await expect(page.getByTestId('stats')).toContainText('7');
  await page.getByRole('link', { name: '今日どこ' }).click();
  await expect(page.getByTestId('suggestion').first()).toBeVisible();
  await context.setOffline(false);
});
