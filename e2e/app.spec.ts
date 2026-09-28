import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * setInputFiles は非ASCII文字（日本語のテスト名由来の出力先など）を含むパスだと
 * change イベントが発火しないことがあるため、ASCII のみの一時ディレクトリを使う。
 */
const asciiTmp = (name: string) => join(mkdtempSync(join(tmpdir(), 'yama-e2e-')), name);

// Service Worker は PWA テスト以外では無効化（キャッシュの影響を排除）
test.use({ serviceWorkers: 'block' });

async function openApp(page: Page, hash = '') {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
}

async function loadSample(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'サンプルデータで試す' }).click();
  await expect(page.getByTestId('stats')).toBeVisible();
}

async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __yamaStore?: { ready: boolean } }).__yamaStore?.ready === true);
}

test('山の追加 → 詳細表示 → 再読み込み後も復元される', async ({ page }) => {
  await openApp(page);
  await page.getByRole('link', { name: '最初の山を登録する' }).click();
  const form = page.getByTestId('mountain-form');
  await form.getByLabel('山名').fill('塔ノ岳');
  await form.getByLabel('読み').fill('とうのだけ');
  await form.locator('input[name=elevation]').fill('1491');
  await form.getByLabel('都道府県').selectOption('神奈川県');
  await form.getByLabel('山域').fill('丹沢');
  await form.locator('input[name=course-0-name]').fill('大倉尾根ピストン');
  await form.locator('input[name=course-0-distance]').fill('14.2');
  await form.locator('input[name=course-0-ascent]').fill('1270');
  await form.locator('input[name=course-0-ct-h]').fill('7');
  await form.locator('input[name=course-0-ct-m]').fill('20');
  // タグ: 地形「尾根」と下山後「温泉」
  await form.getByTestId('fold-tags').locator('summary').first().click();
  await form.getByTestId('tagcat-cat.terrain').getByRole('button', { name: '尾根', exact: true }).click();
  await form.getByTestId('tagcat-cat.after').locator('summary').click();
  await form.getByTestId('tagcat-cat.after').getByRole('button', { name: '温泉', exact: true }).click();
  // カスタムタグをその場で追加
  await form.getByTestId('tagcat-cat.preference').locator('summary').click();
  await form.getByTestId('tagcat-cat.preference').getByRole('button', { name: '追加' }).click();
  await form.getByLabel('新しいタグ名').fill('バカ尾根');
  await form.getByTestId('tagcat-cat.preference').getByRole('button', { name: '追加', exact: true }).click();
  await form.getByTestId('save-mountain').click();

  const hero = page.getByTestId('mountain-hero');
  await expect(hero).toContainText('塔ノ岳');
  await expect(hero).toContainText('1,491');
  await expect(hero).toContainText('関東 / 神奈川県 / 丹沢');
  const metrics = page.getByTestId('mountain-metrics');
  await expect(metrics).toContainText('14.2');
  await expect(metrics).toContainText('1,270');
  await expect(metrics).toContainText('7時間20分');
  const tags = page.getByTestId('mountain-tags');
  await expect(tags).toContainText('尾根');
  await expect(tags).toContainText('温泉');
  await expect(tags).toContainText('バカ尾根');

  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('mountain-hero')).toContainText('塔ノ岳');
  await expect(page.getByTestId('mountain-tags')).toContainText('バカ尾根');
});

test('山の編集・削除（再読み込み後も反映）', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/mountains');
  await page.getByRole('searchbox', { name: '山を検索' }).fill('雲取');
  await page.getByTestId('mountain-card').first().click();
  await expect(page.getByTestId('mountain-hero')).toContainText('2,017');
  await page.getByRole('link', { name: '編集' }).click();
  await page.getByTestId('mountain-form').locator('input[name=elevation]').fill('2018');
  await page.getByTestId('save-mountain').click();
  await expect(page.getByTestId('mountain-hero')).toContainText('2,018');
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('mountain-hero')).toContainText('2,018');

  // 削除（記録のある高尾山: 記録も一緒に消える）
  await page.goto('/#/mountains');
  await page.getByRole('searchbox', { name: '山を検索' }).fill('高尾山');
  await page.getByTestId('mountain-card').first().click();
  await page.getByTestId('delete-mountain').click();
  await expect(page.getByRole('alertdialog')).toContainText('山行記録 2件');
  await page.getByTestId('confirm-ok').click();
  // 削除後は一覧へ戻る
  await expect(page).toHaveURL(/#\/mountains$/);
  await page.getByRole('searchbox', { name: '山を検索' }).fill('高尾山');
  await expect(page.getByTestId('result-count')).toHaveText('0座');
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('result-count')).toHaveText('0座');
  await page.goto('/#/records');
  await expect(page.getByTestId('record-item')).toHaveCount(6);
});

test('山行記録の追加で未踏→登頂済みになり、ペースが計算される', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/mountains');
  await page.getByRole('searchbox', { name: '山を検索' }).fill('瑞牆山');
  await page.getByTestId('mountain-card').first().click();
  await page.getByRole('link', { name: 'この山の山行を記録' }).click();
  const form = page.getByTestId('record-form');
  await form.locator('input[name=date]').fill('2026-09-20');
  await form.getByRole('button', { name: '代表コースの値をコピー' }).click();
  await expect(form.locator('input[name=distance]')).toHaveValue('7.5');
  await form.locator('input[name=duration-h]').fill('4');
  await form.locator('input[name=duration-m]').fill('12');
  await expect(page.getByTestId('pace-box')).toContainText('90%');
  await form.locator('summary', { hasText: 'コンディション' }).click();
  await form.getByRole('button', { name: '晴れ', exact: true }).click();
  await form.getByRole('group', { name: '楽しさ' }).getByRole('button', { name: '楽しさ 5' }).click();
  await form.locator('textarea[name=impressions]').fill('岩場が楽しい！');
  await page.getByTestId('save-record').click();
  await expect(page.getByText('岩場が楽しい！')).toBeVisible();
  await page.getByRole('link', { name: '瑞牆山' }).click();
  await expect(page.getByTestId('mountain-hero').getByRole('button', { name: '登頂済み' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mountain-records').getByTestId('record-item')).toHaveCount(1);
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('mountain-records').getByTestId('record-item')).toHaveCount(1);
});

test('検索・複数条件絞り込み・並び替え', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/mountains');
  await expect(page.getByTestId('result-count')).toHaveText('16座');

  // 読み（カタカナ）でも検索できる
  await page.getByRole('searchbox', { name: '山を検索' }).fill('ヒルガタケ');
  await expect(page.getByTestId('result-count')).toHaveText('1座');
  await page.getByRole('button', { name: '検索をクリア' }).click();

  // 未踏 ＋ 公共交通向き ＋ 尾根 ＋ 累積1000m以上
  await page.getByRole('group', { name: '登頂状況' }).getByRole('button', { name: '未踏' }).click();
  await page.getByRole('button', { name: '累積1000m以上' }).click();
  await page.getByTestId('open-filter').click();
  const sheet = page.getByTestId('filter-sheet');
  await sheet.getByPlaceholder('タグを検索').fill('公共交通');
  await sheet.getByRole('button', { name: '公共交通向き' }).click();
  await sheet.getByPlaceholder('タグを検索').fill('尾根');
  await sheet.getByTestId('tagcat-cat.terrain').getByRole('button', { name: '尾根', exact: true }).click();
  await expect(sheet.getByTestId('apply-filter')).toHaveText('1座を表示');
  await sheet.getByTestId('apply-filter').click();
  await expect(page.getByTestId('result-count')).toHaveText('1座');
  await expect(page.getByTestId('mountain-card')).toContainText('雲取山');

  // 温泉を追加すると 0 座、除外（2回タップ）にすると 1 座
  await page.getByTestId('open-filter').click();
  await sheet.getByPlaceholder('タグを検索').fill('日帰り湯');
  await sheet.getByTestId('tagcat-cat.after').getByRole('button', { name: '温泉' }).click();
  await expect(sheet.getByTestId('apply-filter')).toHaveText('0座を表示');
  await sheet.getByTestId('tagcat-cat.after').getByRole('button', { name: '温泉' }).click();
  await expect(sheet.getByTestId('apply-filter')).toHaveText('1座を表示');
  await sheet.getByTestId('apply-filter').click();
  await expect(page.getByTestId('active-filters')).toContainText('除外: 温泉');

  // 条件クリア → 標高順
  await page.getByRole('button', { name: '条件をクリア' }).click();
  await page.getByRole('group', { name: '登頂状況' }).getByRole('button', { name: 'すべて' }).click();
  await expect(page.getByTestId('result-count')).toHaveText('16座');
  await page.getByTestId('open-sort').click();
  await page.getByTestId('sort-sheet').getByRole('button', { name: '標高', exact: true }).click();
  await expect(page.getByTestId('mountain-card').first()).toContainText('赤岳');
  await page.getByTestId('open-sort').click();
  await page.getByTestId('sort-sheet').getByRole('button', { name: '小さい順・古い順' }).click();
  await expect(page.getByTestId('mountain-card').first()).toContainText('高尾山');
});

test('2〜3座の比較と既登山を基準にした比較', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/mountains');
  await page.getByRole('button', { name: '比較する山を選ぶ' }).click();
  for (const name of ['雲取山', '瑞牆山', '赤岳']) {
    await page.getByTestId('mountain-card').filter({ hasText: name }).click();
  }
  await expect(page.getByTestId('compare-bar')).toContainText('3座を選択中');
  await page.getByTestId('compare-bar').getByRole('button', { name: '比較する' }).click();
  const table = page.getByTestId('compare-table');
  await expect(table.locator('.cmp-head > div')).toHaveCount(3);
  await expect(table.locator('[data-row=distance]')).toContainText('21.0km');
  await expect(table.locator('[data-row=distance] .best')).toContainText('7.5km');
  await expect(table.locator('[data-row=danger]')).toContainText('鎖場');
  await expect(page.getByTestId('compare-benchmark')).toContainText('蛭ヶ岳より距離が短い');
  await expect(page.getByTestId('compare-benchmark')).toContainText('自己最高');
});

test('今日どこ行く？（理由付きで候補表示）', async ({ page }) => {
  await loadSample(page);
  await page.getByTestId('home-today').getByRole('button', { name: '滝を見たい' }).click();
  const list = page.getByTestId('suggestions');
  await expect(list.getByTestId('suggestion').first()).toBeVisible();
  const top3 = await list.getByTestId('suggestion').locator('h3').allInnerTexts();
  expect(top3.slice(0, 3).map((t) => t.split(' ')[0]).sort()).toEqual(['御岳山', '川苔山', '棒ノ折山'].sort());
  await expect(list.getByTestId('suggestion').first()).toContainText('滝');
  await expect(list.getByTestId('suggestion').first()).toContainText('選んだ理由');
  // 必須条件（公共交通・短時間）を追加すると絞られる
  await page.getByRole('button', { name: /公共交通だけ/ }).click();
  await page.getByRole('button', { name: /短時間/ }).click();
  await expect(list.getByTestId('suggestion')).toHaveCount(1);
  await expect(list.getByTestId('suggestion')).toContainText('御岳山');
});

test('JSONエクスポート → 全削除 → JSONインポートで復元', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^yama-note-backup-\d{8}-\d{4}\.json$/);
  const file = asciiTmp('backup.json');
  await download.saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.app).toBe('yama-note');
  expect(json.data.mountains).toHaveLength(16);
  expect(json.data.records).toHaveLength(8);

  // 全削除
  await page.getByRole('button', { name: 'すべてのデータを削除' }).click();
  await page.getByTestId('confirm-ok').click();
  await page.goto('/#/mountains');
  await expect(page.getByTestId('result-count')).toHaveText('0座');

  // インポート（置き換え）
  await page.goto('/#/settings');
  await page.getByTestId('import-file').setInputFiles(file);
  const sheet = page.getByTestId('import-sheet');
  await expect(sheet).toContainText('16座');
  await sheet.getByRole('button', { name: '置き換え' }).click();
  await page.getByTestId('run-import').click();
  await page.getByTestId('confirm-ok').click();
  await expect(sheet).toBeHidden();
  await page.goto('/#/mountains');
  await expect(page.getByTestId('result-count')).toHaveText('16座');
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('result-count')).toHaveText('16座');

  // 端末内バックアップ（リセット前・インポート前）が作られている
  await page.goto('/#/settings');
  await expect(page.getByTestId('backups-card')).toContainText('リセット前');
  await expect(page.getByTestId('backups-card')).toContainText('インポート前');

  // 統合インポートでは重複しない
  await page.getByTestId('import-file').setInputFiles(file);
  await page.getByTestId('run-import').click();
  await page.goto('/#/mountains');
  await expect(page.getByTestId('result-count')).toHaveText('16座');
});

test('壊れたJSONのインポートはエラー表示でデータを変更しない', async ({ page }) => {
  await loadSample(page);
  await page.goto('/#/settings');
  const file = asciiTmp('bad.json');
  writeFileSync(file, '{"hello": "world"}');
  await page.getByTestId('import-file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('バックアップファイルではない');
  await page.goto('/#/mountains');
  await expect(page.getByTestId('result-count')).toHaveText('16座');
});

test('タグ管理: カスタムタグの追加・名前変更・削除', async ({ page }) => {
  await openApp(page, '#/settings/tags');
  const fold = page.getByTestId('tm-cat.scenery');
  await fold.locator('summary').click();
  await fold.getByLabel('景観に新しいタグ').fill('星空');
  await fold.getByRole('button', { name: '追加', exact: true }).click();
  await expect(fold).toContainText('星空');
  await fold.getByRole('button', { name: '星空を編集' }).click();
  await page.getByTestId('tag-edit-sheet').getByLabel('名前').fill('満天の星');
  await page.getByTestId('save-tag').click();
  await expect(fold).toContainText('満天の星');
  await page.reload();
  await waitReady(page);
  await page.getByTestId('tm-cat.scenery').locator('summary').click();
  await expect(page.getByTestId('tm-cat.scenery')).toContainText('満天の星');
  await page.getByRole('button', { name: '満天の星を削除' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('tm-cat.scenery')).not.toContainText('満天の星');
});
