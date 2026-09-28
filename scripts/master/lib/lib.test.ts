import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects } from './csv';
import { matchElevations, parseCoordinate, parseElevation, parseElevationFile, splitNames, type ElevationPoint, type MatchTarget } from './elevation';
import { PrefectureLocator, pointInRing } from './prefecture';
import { dedupeSummits, masterId, toSummit } from './summits';

describe('csv', () => {
  it('parses quoted fields and CRLF', () => {
    expect(parseCsv('a,b\r\n"x,1","y""z"\r\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'y"z'],
    ]);
    expect(parseCsvObjects('﻿lat,lon\n1,2\n')).toEqual([{ lat: '1', lon: '2' }]);
  });
});

describe('summits', () => {
  it('uses gaiji-corrected name and keeps the substitute as alias', () => {
    const s = toSummit({ lat: '36.1', lon: '138.2', name: '大瓢箪山', kana: 'おおひょうたんやま', gaijiFlg: '*_*_7C1E_*', name1: '大瓢簞山' })!;
    expect(s.name).toBe('大瓢簞山');
    expect(s.aliases).toContain('大瓢箪山');
  });
  it('splits multiple readings', () => {
    const s = toSummit({ lat: '38.1', lon: '140.4', name: '蔵王山', kana: 'ざおうざん,ざおうさん', gaijiFlg: '0', name1: '蔵王山' })!;
    expect(s.kana).toBe('ざおうざん');
    expect(s.aliases).toEqual(['ざおうさん']);
  });
  it('rejects rows outside Japan or without a name', () => {
    expect(toSummit({ lat: '0', lon: '0', name1: 'x', kana: 'x' })).toBeUndefined();
    expect(toSummit({ lat: '36', lon: '138', name1: '', kana: 'x' })).toBeUndefined();
  });
  it('generates deterministic ids that differ for same-name mountains', () => {
    const a = masterId('大山', 35.4406, 139.2317);
    expect(masterId('大山', 35.4406, 139.2317)).toBe(a);
    expect(masterId('大山', 36.19, 138.809)).not.toBe(a);
    expect(masterId('丹沢山', 35.4406, 139.2317)).not.toBe(a);
    expect(a).toMatch(/^g\d{13}[0-9a-z]{7}$/);
  });
  it('dedupes same-name labels within 50m only', () => {
    const base = { name: '丸山', kana: 'まるやま', aliases: [] as string[], lat: 36, lon: 138 };
    const { rows, removed } = dedupeSummits([base, { ...base, lat: 36.0002 }, { ...base, lat: 36.01 }]);
    expect(removed).toBe(1);
    expect(rows).toHaveLength(2);
  });
});

// 2つの正方形の「県」が経度 138.0 で接している単純なモデル
const square = (x0: number, x1: number) => [
  [
    [x0, 35.9],
    [x1, 35.9],
    [x1, 36.1],
    [x0, 36.1],
    [x0, 35.9],
  ],
];
const feature = (x0: number, x1: number) => ({ properties: {}, geometry: { type: 'Polygon' as const, coordinates: square(x0, x1) } });

describe('prefecture locator', () => {
  const loc = new PrefectureLocator(400, 2000);
  loc.addPrefecture('西県', [feature(137.9, 138.0)]);
  loc.addPrefecture('東県', [feature(138.0, 138.1)]);

  it('point in ring', () => {
    expect(pointInRing(137.95, 36, square(137.9, 138)[0])).toBe(true);
    expect(pointInRing(138.05, 36, square(137.9, 138)[0])).toBe(false);
  });

  it('assigns a single prefecture far from the border', () => {
    expect(loc.locate(36, 137.95)?.all).toEqual(['西県']);
    expect(loc.locate(36, 138.05)?.all).toEqual(['東県']);
  });

  it('assigns both prefectures to a mountain on (or near) the border, containing one first', () => {
    // 境界から東に約 180m（経度 0.002 度 ≒ 180m）
    const r = loc.locate(36, 138.002)!;
    expect(r.all).toEqual(['東県', '西県']);
    // 境界から約 900m → 単独
    expect(loc.locate(36, 138.01)!.all).toEqual(['東県']);
  });

  it('snaps points just outside all polygons to the nearest prefecture, or rejects far ones', () => {
    const r = loc.locate(36.1005, 137.95)!; // 北へ約 55m はみ出し
    expect(r.primary).toBe('西県');
    expect(r.approximated).toBe(true);
    expect(loc.locate(37, 137.95)).toBeUndefined();
  });
});

describe('elevation parsing', () => {
  it('parses decimal and DMS coordinates', () => {
    expect(parseCoordinate('35.95162')).toBeCloseTo(35.95162);
    expect(parseCoordinate('35°57′5.8″')).toBeCloseTo(35 + 57 / 60 + 5.8 / 3600, 6);
    expect(parseCoordinate('35度57分5.8秒')).toBeCloseTo(35.95161, 4);
    expect(parseCoordinate('355705.8')).toBeCloseTo(35.95161, 4);
    expect(parseCoordinate('1390552')).toBeCloseTo(139.09778, 4);
    expect(parseCoordinate('')).toBeUndefined();
  });
  it('parses elevation and names with parentheses', () => {
    expect(parseElevation('1,304')).toBe(1304);
    expect(parseElevation('3776.12m')).toBe(3776.12);
    expect(parseElevation('-')).toBeUndefined();
    expect(splitNames('穂高岳（奥穂高岳）')).toEqual({ name: '穂高岳', alts: ['奥穂高岳'] });
  });
  it('reads CSV with a title line before the header, in Shift_JIS-agnostic way', () => {
    const csv = '日本の主な山岳標高\n山名,山名（よみ）,標高,緯度,経度\n武甲山,ぶこうさん,1304,35°57′05.8″,139°05′52.0″\n';
    const { points } = parseElevationFile(new TextEncoder().encode(csv), 'x.csv');
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ name: '武甲山', kana: 'ぶこうさん', elevationM: 1304 });
    expect(points[0].lat).toBeCloseTo(35.9516, 3);
  });
  it('reads GeoJSON points', () => {
    const gj = { type: 'FeatureCollection', features: [{ properties: { 山名: '谷川岳', 標高: '1977' }, geometry: { type: 'Point', coordinates: [138.93, 36.8358] } }] };
    const { points } = parseElevationFile(new TextEncoder().encode(JSON.stringify(gj)), 'x.geojson');
    expect(points[0]).toMatchObject({ name: '谷川岳', elevationM: 1977, lon: 138.93 });
  });
});

describe('elevation matching (never by name alone)', () => {
  const targets: MatchTarget[] = [
    { id: 'a', name: '大山', kana: 'おおやま', aliases: [], lat: 35.4406, lon: 139.2317 },
    { id: 'b', name: '大山', kana: 'おおやま', aliases: [], lat: 36.19, lon: 138.809 },
    { id: 'c', name: '武甲山', kana: 'ぶこうざん', aliases: [], lat: 35.95162, lon: 139.097785 },
    { id: 'd', name: '小持山', kana: 'こもちやま', aliases: [], lat: 35.9412, lon: 139.0998 },
  ];
  const pt = (p: Partial<ElevationPoint>): ElevationPoint => ({ name: '', altNames: [], lat: 0, lon: 0, elevationM: 1000, ...p });

  it('matches by distance + name, picking the geographically correct same-name mountain', () => {
    const r = matchElevations([pt({ name: '大山', lat: 35.4408, lon: 139.2315, elevationM: 1252 })], targets, { maxDistanceM: 150 });
    expect(r.elevations.get('a')).toBe(1252);
    expect(r.elevations.has('b')).toBe(false);
  });

  it('does not match a same-name mountain that is far away', () => {
    const r = matchElevations([pt({ name: '大山', lat: 35.0, lon: 135.0 })], targets, { maxDistanceM: 150 });
    expect(r.matched).toBe(0);
    expect(r.noCandidate).toBe(1);
  });

  it('does not match a nearby mountain with a different name', () => {
    const r = matchElevations([pt({ name: '大持山', lat: 35.9413, lon: 139.0997 })], targets, { maxDistanceM: 150 });
    expect(r.matched).toBe(0);
    expect(r.nameMismatch).toBe(1);
  });

  it('accepts reading match and alternative names in parentheses', () => {
    const r = matchElevations([pt({ name: '秩父の山', altNames: ['武甲山'], lat: 35.9517, lon: 139.0977, elevationM: 1304 })], targets, { maxDistanceM: 150 });
    expect(r.elevations.get('c')).toBe(1304);
  });

  it('rejects ambiguous cases (two same-name candidates at similar distance)', () => {
    const twins: MatchTarget[] = [
      { id: 'x', name: '丸山', kana: 'まるやま', aliases: [], lat: 36.0, lon: 138.0 },
      { id: 'y', name: '丸山', kana: 'まるやま', aliases: [], lat: 36.0006, lon: 138.0 },
    ];
    const r = matchElevations([pt({ name: '丸山', lat: 36.0003, lon: 138.0 })], twins, { maxDistanceM: 150 });
    expect(r.matched).toBe(0);
    expect(r.ambiguous).toBe(1);
  });
});
