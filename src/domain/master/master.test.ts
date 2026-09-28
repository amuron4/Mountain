import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rowsToMasters } from '../../data/masterRepository';
import { createMountain } from '../mountain';
import { distanceMeters, isSameMountain, masterToMountainFields, mountainFromMaster, RegisteredLookup } from './link';
import { MasterIndex, MATCH_RANK } from './search';
import type { MasterChunkFile, MasterManifest, MountainMaster } from './types';

const mk = (p: Partial<MountainMaster> & Pick<MountainMaster, 'id' | 'name' | 'kana'>): MountainMaster => ({
  latitude: 36,
  longitude: 138,
  prefectures: ['長野県'],
  source: 'test',
  ...p,
});

const FIXTURE: MountainMaster[] = [
  mk({ id: 'buko', name: '武甲山', kana: 'ぶこうざん', latitude: 35.95162, longitude: 139.097785, prefectures: ['埼玉県'], elevationM: 1304 }),
  mk({ id: 'tanigawa', name: '谷川岳', kana: 'たにがわだけ', latitude: 36.835779, longitude: 138.930331, prefectures: ['群馬県', '新潟県'], elevationM: 1977 }),
  mk({ id: 'oyama-kanagawa', name: '大山', kana: 'おおやま', latitude: 35.4406, longitude: 139.2317, prefectures: ['神奈川県'] }),
  mk({ id: 'oyama-gunma1', name: '大山', kana: 'おおやま', latitude: 36.19, longitude: 138.809, prefectures: ['群馬県'] }),
  mk({ id: 'oyama-gunma2', name: '大山', kana: 'おおやま', latitude: 36.29, longitude: 138.658, prefectures: ['群馬県'] }),
  mk({ id: 'kumotori', name: '雲取山', kana: 'くもとりやま', latitude: 35.855579, longitude: 138.943934, prefectures: ['東京都', '埼玉県', '山梨県'] }),
  mk({ id: 'kobushi', name: '甲武信ヶ岳', kana: 'こぶしがたけ', latitude: 35.90913, longitude: 138.728869, prefectures: ['山梨県', '埼玉県', '長野県'] }),
  mk({ id: 'oyamada', name: '小山田山', kana: 'おやまだやま', prefectures: ['福島県'] }),
  mk({ id: 'nabewari', name: '鍋割山', kana: 'なべわりやま', prefectures: ['神奈川県'], aliases: ['なべわりさん'] }),
];

describe('MasterIndex search', () => {
  const index = new MasterIndex(FIXTURE);
  const names = (q: string, prefectures?: string[]) => index.search(q, { prefectures }).hits.map((h) => h.master.id);

  it('1. finds 武甲山 by kanji', () => {
    expect(names('武甲山')).toEqual(['buko']);
    expect(index.search('武甲山').hits[0].rank).toBe(MATCH_RANK.nameExact);
  });

  it('2. finds 武甲山 by hiragana, katakana and half-width katakana', () => {
    expect(names('ぶこう')).toContain('buko');
    expect(names('ブコウ')).toContain('buko');
    expect(names('ﾌﾞｺｳ')).toContain('buko');
    expect(names('ぶこうさん')).toContain('buko'); // 濁点の揺れ（ざん/さん）も最下位で拾う
  });

  it('orders exact > reading exact > prefix > partial', () => {
    const r = index.search('おおやま');
    expect(r.hits.slice(0, 3).every((h) => h.rank === MATCH_RANK.kanaExact)).toBe(true);
    expect(index.search('たにがわ').hits[0].rank).toBe(MATCH_RANK.kanaPrefix);
    expect(index.search('谷川').hits[0].rank).toBe(MATCH_RANK.namePrefix);
    expect(index.search('川岳').hits[0].rank).toBe(MATCH_RANK.namePartial);
    const mixed = index.search('山');
    const ranks = mixed.hits.map((h) => h.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('handles ヶ/ケ variations and aliases', () => {
    expect(names('甲武信ケ岳')).toEqual(['kobushi']);
    expect(names('甲武信岳')).toEqual(['kobushi']);
    expect(names('なべわりさん')).toEqual(['nabewari']);
  });

  it('3. keeps same-name mountains separate and distinguishable by prefecture and coordinates', () => {
    const r = index.search('大山');
    const hits = r.hits.filter((h) => h.master.name === '大山');
    expect(hits).toHaveLength(3);
    expect(new Set(hits.map((h) => h.master.id)).size).toBe(3);
    expect(hits.map((h) => h.master.prefectures[0]).sort()).toEqual(['神奈川県', '群馬県', '群馬県'].sort());
    const gunma = hits.filter((h) => h.master.prefectures[0] === '群馬県');
    expect(distanceMeters({ lat: gunma[0].master.latitude, lng: gunma[0].master.longitude }, { lat: gunma[1].master.latitude, lng: gunma[1].master.longitude })).toBeGreaterThan(1000);
  });

  it('7. filters by prefecture', () => {
    expect(names('大山', ['神奈川県'])).toEqual(['oyama-kanagawa']);
    expect(names('大山', ['群馬県']).sort()).toEqual(['oyama-gunma1', 'oyama-gunma2']);
    expect(names('', ['埼玉県']).sort()).toEqual(['buko', 'kobushi', 'kumotori']);
    expect(index.search('').total).toBe(0); // 検索語も県もなければ何も返さない（全件描画を避ける）
  });

  it('8. finds a border mountain from each of its prefectures', () => {
    for (const p of ['群馬県', '新潟県']) expect(names('谷川岳', [p])).toEqual(['tanigawa']);
    for (const p of ['東京都', '埼玉県', '山梨県']) expect(names('雲取', [p])).toEqual(['kumotori']);
    expect(names('谷川岳', ['長野県'])).toEqual([]);
  });

  it('limits results and reports the total', () => {
    const r = index.search('山', { limit: 2 });
    expect(r.hits).toHaveLength(2);
    expect(r.total).toBeGreaterThan(2);
    expect(index.search('山', { limit: 2, offset: 2 }).hits[0].master.id).not.toBe(r.hits[0].master.id);
  });
});

describe('master → Mountain', () => {
  const buko = FIXTURE[0];
  const unknown = FIXTURE[2];

  it('4. fills name, kana, elevation, prefectures, region and coordinates', () => {
    const f = masterToMountainFields(buko);
    expect(f).toMatchObject({ name: '武甲山', kana: 'ぶこうざん', elevationM: 1304, prefectures: ['埼玉県'], region: '関東', masterId: 'buko' });
    expect(f.location).toEqual({ lat: 35.95162, lng: 139.097785 });
    const tani = masterToMountainFields(FIXTURE[1]);
    expect(tani.prefectures).toEqual(['群馬県', '新潟県']);
  });

  it('9. elevation-unknown mountains become Mountains with elevationM undefined', () => {
    const m = mountainFromMaster(unknown);
    expect(m.elevationM).toBeUndefined();
    expect(m.name).toBe('大山');
    expect(m.status).toBe('unclimbed');
    expect(m.id).not.toBe(unknown.id); // ユーザーデータの ID はマスターとは別
  });

  it('6. detects registered mountains by masterId or by coordinates + name, never by name alone', () => {
    const registered = mountainFromMaster(FIXTURE[3]); // 群馬の大山その1
    const lookup = new RegisteredLookup([registered]);
    expect(lookup.find(FIXTURE[3])?.id).toBe(registered.id);
    expect(lookup.find(FIXTURE[4])).toBeUndefined(); // 同名別山
    expect(lookup.find(FIXTURE[2])).toBeUndefined(); // 同名別山（別の県）

    // 手入力で登録済み（masterId なし）でも、座標が近く同名なら登録済みとみなす
    const manual = createMountain({ name: '武甲山', location: { lat: 35.9517, lng: 139.0979 } });
    expect(isSameMountain(buko, manual)).toBe(true);
    // 位置が無い手入力の山は名前だけでは判定しない
    expect(isSameMountain(buko, createMountain({ name: '武甲山' }))).toBe(false);
  });
});

describe('generated master data (public/master)', () => {
  const manifest = JSON.parse(readFileSync('public/master/manifest.json', 'utf8')) as MasterManifest;
  const all = manifest.chunks.flatMap((c) => rowsToMasters(JSON.parse(readFileSync(`public/master/${c.file}`, 'utf8')) as MasterChunkFile));
  const index = new MasterIndex(all);

  it('covers the configured 19 prefectures with thousands of mountains and unique ids', () => {
    expect(manifest.prefectures).toHaveLength(19);
    expect(manifest.chunks.map((c) => c.prefecture)).toEqual(manifest.prefectures);
    expect(all.length).toBe(manifest.total);
    expect(all.length).toBeGreaterThan(5000);
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    expect(manifest.sources.map((s) => s.key)).toEqual(expect.arrayContaining(['gsi-vt', 'n03']));
  });

  it('every mountain has a name, reading, coordinates and at least one target prefecture', () => {
    const targets = new Set(manifest.prefectures);
    for (const m of all) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.latitude).toBeGreaterThan(20); // 小笠原諸島（東京都）を含む
      expect(m.longitude).toBeGreaterThan(122);
      expect(m.prefectures.some((p) => targets.has(p))).toBe(true);
    }
  });

  it('elevations are only present with a source (never guessed)', () => {
    const withElev = all.filter((m) => m.elevationM !== undefined);
    expect(withElev.length).toBe(manifest.withElevation);
    for (const m of withElev) expect(m.elevationSource).toBeTruthy();
  });

  it('武甲山 is in 埼玉県, and border mountains carry multiple prefectures', () => {
    const buko = index.search('武甲山').hits[0].master;
    expect(buko.prefectures).toEqual(['埼玉県']);
    expect(distanceMeters({ lat: buko.latitude, lng: buko.longitude }, { lat: 35.9516, lng: 139.0978 })).toBeLessThan(100);
    const tani = index.search('谷川岳').hits.find((h) => h.master.name === '谷川岳')!.master;
    expect(tani.prefectures.sort()).toEqual(['新潟県', '群馬県'].sort());
    const kumo = index.search('雲取山', { prefectures: ['東京都'] }).hits[0].master;
    expect(kumo.prefectures.sort()).toEqual(['埼玉県', '山梨県', '東京都'].sort());
    const fuji = index.search('富士山', { prefectures: ['静岡県'] }).hits.find((h) => h.master.kana === 'ふじさん')!.master;
    expect(fuji.prefectures.sort()).toEqual(['山梨県', '静岡県'].sort());
  });

  it('mountains outside the target prefectures are not included', () => {
    expect(index.search('石鎚山').total).toBe(0); // 愛媛県
    expect(index.search('大雪山').hits.every((h) => !h.master.prefectures.includes('北海道'))).toBe(true);
  });
});

describe('elevation with source (DEM vs official)', () => {
  it('decodes rows with elevation and source, and keeps undefined when missing', async () => {
    const { rowsToMasters } = await import('../../data/masterRepository');
    const chunk = {
      format: 1 as const,
      prefecture: '埼玉県',
      fields: ['id', 'name', 'kana', 'lat', 'lon', 'prefectures', 'elevationM', 'aliases', 'range', 'elevationSource'] as MasterChunkFile['fields'],
      source: 'gsi-vt',
      rows: [
        ['a', '武甲山', 'ぶこうざん', 35.95162, 139.097785, ['11'], 1303.9, null, null, 'gsi-dem5a'],
        ['b', '両神山', 'りょうかみさん', 36.0234, 138.8412, ['11'], 1723, null, null, 'gsi-sangaku'],
        ['c', '丸山', 'まるやま', 36.0, 139.0, ['11'], null],
      ] as MasterChunkFile['rows'],
    };
    const [a, b, c] = rowsToMasters(chunk);
    expect(a).toMatchObject({ elevationM: 1303.9, elevationSource: 'gsi-dem5a', prefectures: ['埼玉県'] });
    expect(b).toMatchObject({ elevationM: 1723, elevationSource: 'gsi-sangaku' });
    expect(c.elevationM).toBeUndefined();
    expect(c.elevationSource).toBeUndefined();
  });

  it('copies elevation as integer m with its source into the user Mountain', async () => {
    const { elevationSourceLabel, formatElevationM } = await import('./elevationSource');
    const dem = { ...FIXTURE[0], elevationM: 1303.9, elevationSource: 'gsi-dem5a' };
    const f = masterToMountainFields(dem);
    expect(f.elevationM).toBe(1304);
    expect(f.ext).toEqual({ elevationSource: 'gsi-dem5a' });
    expect(formatElevationM(1303.9)).toBe('1,304m');
    expect(elevationSourceLabel('gsi-dem5a')).toMatchObject({ short: 'DEM5A', official: false });
    expect(elevationSourceLabel('gsi-sangaku')).toMatchObject({ official: true });
    expect(elevationSourceLabel('gsi-sangaku')!.short).toBeUndefined();
    // 標高不明の山には出典も付けない
    expect(masterToMountainFields(FIXTURE[2]).ext).toBeUndefined();
    // 手入力済みの標高は紐づけで上書きしない（出典も付けない）
    const { linkMountainToMaster } = await import('./link');
    const linked = linkMountainToMaster(createMountain({ name: '武甲山', elevationM: 1304 }), dem);
    expect(linked.elevationM).toBe(1304);
    expect(linked.ext?.elevationSource).toBeUndefined();
  });
});
