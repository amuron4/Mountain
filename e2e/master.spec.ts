import { expect, test, type Page } from '@playwright/test';

// 山マスター（山名データ）機能の E2E。Service Worker はオフラインテスト以外では無効化
test.use({ serviceWorkers: 'block' });

async function openApp(page: Page, hash = '') {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
}

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
}

const searchBox = (page: Page) => page.getByLabel('山名データを検索');
const hit = (page: Page, name: string) => page.getByTestId('master-hit').filter({ has: page.locator('.mh-name', { hasText: new RegExp(`^${name}`) }) });

test('4・5・9. 山名オートコンプリート → フォーム自動入力 → 保存 → 通常の山として編集・再読み込み後も維持', async ({ page }) => {
  await openApp(page, '#/mountains/new');
  const form = page.getByTestId('mountain-form');
  const suggest = page.getByTestId('master-suggest');
  // 公式の山岳標高に無い山は「標高不明」（推測しない）
  await form.getByRole('textbox', { name: '山名' }).fill('こもちやま');
  await expect(suggest.getByTestId('master-hit').filter({ hasText: '小持山' }).filter({ hasText: '埼玉県' })).toContainText('標高不明');

  await form.getByRole('textbox', { name: '山名' }).fill('ぶこ');
  await expect(suggest).toBeVisible();
  const buko = suggest.getByTestId('master-hit').filter({ hasText: '武甲山' });
  await expect(buko).toContainText('ぶこうざん');
  await expect(buko).toContainText('埼玉県');
  await expect(buko).toContainText('1,304m'); // 国土地理院「日本の主な山岳標高」の公表値
  await expect(buko).not.toContainText('DEM');
  await buko.locator('.mh-main').click();

  await expect(suggest).toBeHidden();
  await expect(form.getByLabel('山名')).toHaveValue('武甲山');
  await expect(form.getByLabel('読み')).toHaveValue('ぶこうざん');
  await expect(form.locator('input[name=elevation]')).toHaveValue('1304');
  await expect(page.getByTestId('elevation-source')).toContainText('日本の主な山岳標高');
  await expect(form.getByRole('button', { name: '埼玉県を外す' })).toBeVisible();
  await expect(form.locator('#region')).toHaveValue('関東');
  await expect(page.getByTestId('master-linked')).toContainText('35.95162, 139.09778');

  // ユーザーが追加情報を入力して保存
  await form.getByRole('group', { name: '行きたい度' }).getByRole('button', { name: '★★★' }).click();
  await page.getByTestId('save-mountain').click();

  const hero = page.getByTestId('mountain-hero');
  await expect(hero).toContainText('武甲山');
  await expect(hero).toContainText('1,304');
  await expect(page.getByTestId('mountain-location')).toContainText('35.9516, 139.0978');

  // 通常の Mountain と同様に編集できる
  await page.getByRole('link', { name: '編集' }).click();
  await page.getByTestId('mountain-form').locator('summary', { hasText: 'メモ・リンク' }).click();
  await page.getByTestId('mountain-form').locator('textarea[name=memo]').fill('石灰岩の採掘で山頂が削られている');
  await page.getByTestId('save-mountain').click();
  await expect(page.getByText('石灰岩の採掘で山頂が削られている')).toBeVisible();

  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('mountain-hero')).toContainText('1,304');
  await expect(page.getByText('石灰岩の採掘で山頂が削られている')).toBeVisible();
  await expect(page.getByTestId('mountain-location')).toBeVisible();
});

test('1・2・3・6. 山を探す: 漢字/ひらがな/カタカナ検索、同名山の区別、ワンタップ登録、重複登録防止', async ({ page }) => {
  await openApp(page, '#/mountains');
  await page.getByTestId('tab-search').click();
  await expect(page.getByTestId('master-count')).toContainText('座の山名データ');

  await searchBox(page).fill('武甲山');
  await expect(hit(page, '武甲山')).toHaveCount(1);
  await searchBox(page).fill('ぶこう');
  await expect(hit(page, '武甲山')).toHaveCount(1);
  await searchBox(page).fill('ブコウ');
  await expect(hit(page, '武甲山')).toHaveCount(1);
  await expect(page.getByTestId('master-hit').first()).toContainText('武甲山');

  // 同名の山は都道府県（同じ県なら座標）で見分けられる
  await searchBox(page).fill('大山');
  const oyama = hit(page, '大山');
  await expect(oyama.first()).toBeVisible();
  await expect.poll(() => oyama.count()).toBeGreaterThan(5);
  const labels = await oyama.locator('.mh-sub').allInnerTexts();
  expect(new Set(labels).size).toBe(labels.length);

  // 県境の山（谷川岳）をワンタップ登録
  await searchBox(page).fill('たにがわ');
  const tani = hit(page, '谷川岳').first();
  await expect(tani).toContainText('群馬県・新潟県');
  await tani.getByRole('button', { name: '谷川岳を自分の山に追加' }).click();
  await expect(page.getByRole('status')).toContainText('谷川岳');
  await expect(tani).toContainText('登録済み');
  await expect(tani.getByRole('button', { name: /追加/ })).toHaveCount(0);

  // 自分の山に1件だけ入っている
  await page.getByTestId('tab-mine').click();
  await expect(page.getByTestId('result-count')).toHaveText('1座');

  // 登録フォームで同じ山を選ぼうとすると、登録済みの山へ誘導される
  await page.goto('/#/mountains/new');
  await page.getByTestId('mountain-form').getByLabel('山名').fill('谷川岳');
  const s = page.getByTestId('master-suggest').getByTestId('master-hit').filter({ hasText: '群馬県・新潟県' });
  await expect(s).toContainText('登録済み');
  await s.locator('.mh-main').click();
  await expect(page.getByRole('alertdialog')).toContainText('登録済み');
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('mountain-hero')).toContainText('谷川岳');
  await page.goto('/#/mountains');
  await page.getByTestId('tab-mine').click();
  await expect(page.getByTestId('result-count')).toHaveText('1座');
});

test('7・8. 都道府県フィルター（県境の山はどちらの県でも出る）', async ({ page }) => {
  await openApp(page, '#/mountains?tab=search');
  await searchBox(page).fill('雲取山');
  const pick = async (prefs: string[]) => {
    await page.getByTestId('open-pref-filter').click();
    const sheet = page.getByTestId('pref-filter-sheet');
    await sheet.getByRole('button', { name: 'すべて' }).click();
    for (const p of prefs) await sheet.getByRole('button', { name: p, exact: true }).click();
    await page.getByTestId('pref-filter-done').click();
  };
  for (const p of ['東京都', '埼玉県', '山梨県']) {
    await pick([p]);
    await expect(page.getByTestId('pref-chips')).toContainText(p);
    await expect(hit(page, '雲取山').filter({ hasText: '東京都・埼玉県・山梨県' })).toHaveCount(1);
  }
  await pick(['長野県']);
  await expect(hit(page, '雲取山').filter({ hasText: '東京都・埼玉県・山梨県' })).toHaveCount(0);

  // 検索語なしでも都道府県を選べば一覧できる（件数制限＋さらに表示）
  await searchBox(page).fill('');
  await pick(['千葉県']);
  const count = Number((await page.getByTestId('master-count').innerText()).replace(/[^\d]/g, ''));
  expect(count).toBeGreaterThan(30);
  await expect(page.getByTestId('master-hit')).toHaveCount(30);
  await page.getByTestId('master-more').click();
  await expect(page.getByTestId('master-hit')).toHaveCount(Math.min(60, count));
  const prefs = await page.getByTestId('master-hit').locator('.mh-pref').allInnerTexts();
  expect(prefs.every((p) => p.includes('千葉県'))).toBe(true);
});

test('10. 既存の山・山行データはアップデート後も維持され、同名の手入力山には紐づけを提案する', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
  await expect(page.getByTestId('stats')).toBeVisible();
  await page.reload();
  await waitReady(page);
  await page.goto('/#/mountains');
  await page.getByTestId('tab-mine').click();
  await expect(page.getByTestId('result-count')).toHaveText('16座');
  await page.goto('/#/records');
  await expect(page.getByTestId('record-item')).toHaveCount(8);

  // サンプルの雲取山は位置情報なし → 「同名の登録あり」として紐づけを提案
  await page.goto('/#/mountains?tab=search');
  await searchBox(page).fill('雲取山');
  const kumo = hit(page, '雲取山').filter({ hasText: '東京都・埼玉県・山梨県' });
  await expect(kumo).toContainText('同名の登録あり');
  await kumo.getByRole('button', { name: /追加/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText('位置情報がない');
  await page.getByTestId('confirm-ok').click();
  await expect(kumo).toContainText('登録済み');
  await page.getByTestId('tab-mine').click();
  await expect(page.getByTestId('result-count')).toHaveText('16座'); // 増えていない
  await page.getByRole('searchbox', { name: '山を検索' }).fill('雲取');
  await page.getByTestId('mountain-card').first().click();
  await expect(page.getByTestId('mountain-location')).toContainText('35.8556');
  await expect(page.getByTestId('mountain-hero')).toContainText('2,017'); // 入力済みの標高は上書きしない
});

test('12. iPhone 相当の幅で候補 UI が崩れない', async ({ page }, testInfo) => {
  await openApp(page, '#/mountains/new');
  await page.getByTestId('mountain-form').getByLabel('山名').fill('やま');
  await expect(page.getByTestId('master-suggest').getByTestId('master-hit').first()).toBeVisible();
  const vw = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
  for (const box of await page.getByTestId('master-suggest').getByTestId('master-hit').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('suggest-iphone.png') });

  await page.goto('/#/mountains?tab=search');
  await searchBox(page).fill('ほたか');
  await expect(page.getByTestId('master-hit').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
  const add = page.getByTestId('master-hit').first().getByRole('button', { name: /追加/ });
  const b = (await add.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.x + b.width).toBeLessThanOrEqual(vw);
  const filter = (await page.getByTestId('open-pref-filter').boundingBox())!;
  expect(filter.x + filter.width).toBeLessThanOrEqual(vw);
  await page.screenshot({ path: testInfo.outputPath('search-iphone.png') });
});

test('出典表示: 設定の「山名データについて」', async ({ page }) => {
  await openApp(page, '#/settings');
  await page.getByTestId('open-master-about').click();
  const sheet = page.getByTestId('master-about');
  await expect(sheet).toContainText('参考情報');
  await expect(sheet).toContainText('公式地図');
  await expect(sheet).toContainText('国土地理院');
  await expect(sheet).toContainText('国土数値情報');
  await expect(sheet).toContainText('MIT');
  await expect(sheet).toContainText('日本の主な山岳標高');
  await expect(sheet.getByTestId('master-source')).toHaveCount(3);
});
