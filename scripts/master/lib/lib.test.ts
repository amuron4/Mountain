import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvObjects } from './csv';
import { matchElevations, matchKey, parseCoordinate, parseElevation, parseElevationFile, parseMountainLabel, splitNames, type ElevationPoint, type MatchTarget } from './elevation';
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

describe('日本の主な山岳標高の形式（山名＜山頂名＞）', () => {
  it('splits angle-bracket summit names and readings, and matches by summit name', () => {
    expect(splitNames('八ヶ岳＜赤岳＞')).toEqual({ name: '八ヶ岳', alts: ['赤岳'] });
    expect(splitNames('谷川岳<オキノ耳>')).toEqual({ name: '谷川岳', alts: ['オキノ耳'] });
    const gj = {
      type: 'FeatureCollection',
      features: [{ properties: { '山名<山頂名>': '八ヶ岳＜赤岳＞', '山名よみ<山頂名よみ>': 'やつがたけ＜あかだけ＞', 標高値: '2899.4' }, geometry: { type: 'Point', coordinates: [138.37025, 35.97082] } }],
    };
    const { points, hasCoordinates } = parseElevationFile(new TextEncoder().encode(JSON.stringify(gj)), 'sangaku.geojson');
    expect(hasCoordinates).toBe(true);
    expect(points[0]).toMatchObject({ name: '八ヶ岳', kana: 'やつがたけ', elevationM: 2899.4 });
    expect(points[0].altNames).toEqual(['赤岳', 'あかだけ']);
    const r = matchElevations(points, [{ id: 'aka', name: '赤岳', kana: 'あかだけ', aliases: [], lat: 35.970893, lon: 138.370208 }], { maxDistanceM: 150 });
    expect(r.elevations.get('aka')).toBe(2899.4);
  });

  it('refuses a CSV without coordinates (would be name-only matching)', () => {
    const csv = '連番,山名<山頂名>,山名よみ<山頂名よみ>,標高値,都道府県\n1,武甲山,ぶこうさん,1304,埼玉県\n';
    const r = parseElevationFile(new TextEncoder().encode(csv), 'x.csv');
    expect(r.hasCoordinates).toBe(false);
    expect(r.points).toHaveLength(0);
  });
});

describe('日本の主な山岳標高（1003山）の実データで見つかった形式', () => {
  const t = (id: string, name: string, kana: string, lat: number, lon: number): MatchTarget => ({ id, name, kana, aliases: [], lat, lon });
  const pt = (p: Partial<ElevationPoint>): ElevationPoint => ({ name: '', altNames: [], lat: 0, lon: 0, elevationM: 1000, ...p });
  const opts = { maxDistanceM: 150, farDistanceM: 600, uniqueRadiusM: 3000 };

  it('parses nested parentheses and island names in brackets', () => {
    expect(parseMountainLabel('蔵王山＜不忘山（御前岳）＞')).toEqual({ name: '蔵王山', nameAlts: [], summit: '不忘山', summitAlts: ['御前岳'] });
    expect(parseMountainLabel('大雪山（ヌタプカウシペ）＜旭岳＞')).toEqual({ name: '大雪山', nameAlts: ['ヌタプカウシペ'], summit: '旭岳', summitAlts: [] });
    expect(splitNames('鶏冠山（黒川山）')).toEqual({ name: '鶏冠山', alts: ['黒川山'] });
    expect(parseMountainLabel('[南硫黄島]').name).toBe('南硫黄島');
  });

  it('folds kanji variants only for matching', () => {
    expect(matchKey('金峯山')).toBe(matchKey('金峰山'));
    expect(matchKey('八ケ岳')).toBe(matchKey('八ヶ岳'));
    expect(matchKey('剣が峰')).toBe(matchKey('剣ヶ峰'));
    expect(matchKey('御嶽山')).toBe(matchKey('御岳山'));
    expect(matchKey('大山')).not.toBe(matchKey('丸山'));
  });

  it('gives the summit elevation to both the summit label and the mountain label (那須岳＜茶臼岳＞)', () => {
    const gj = {
      features: [{ properties: { '山名＜山頂名＞': '那須岳＜茶臼岳＞', '山名よみ＜山頂名よみ＞': 'なすだけ＜ちゃうすだけ＞', '標高値(m)': 1915 }, geometry: { type: 'Point', coordinates: [139.963, 37.1225] } }],
    };
    const { points } = parseElevationFile(new TextEncoder().encode(JSON.stringify(gj)), 'x.geojson');
    expect(points[0].summitNames).toEqual(['茶臼岳', 'ちゃうすだけ']);
    const r = matchElevations(points, [t('cha', '茶臼岳', 'ちゃうすだけ', 37.12252, 139.96298), t('nasu', '那須岳', 'なすだけ', 37.1226, 139.9631)], opts);
    expect(r.elevations.get('cha')).toBe(1915);
    expect(r.elevations.get('nasu')).toBe(1915);
  });

  it('accepts a label a few hundred metres from the summit only when no same-name mountain is nearby', () => {
    const p = pt({ name: '富士山', summitNames: ['剣ヶ峯'], altNames: ['剣ヶ峯'], lat: 35.360738, lon: 138.727373, elevationM: 3776 });
    const fuji = t('fuji', '富士山', 'ふじさん', 35.362941, 138.73145); // 約 440m
    const r = matchElevations([p], [fuji, t('other', '富士山', 'ふじさん', 36.3133, 138.1501)], opts);
    expect(r.elevations.get('fuji')).toBe(3776);
    expect(r.far).toHaveLength(1);
    // 同じ名前の山が 3km 以内にもう1つあるなら、遠めの注記は採用しない
    const twin = t('twin', '富士山', 'ふじさん', 35.37, 138.74);
    expect(matchElevations([p], [fuji, twin], opts).elevations.size).toBe(0);
    // 既定（farDistanceM なし）では 150m を超えるものは採用しない
    expect(matchElevations([p], [fuji], { maxDistanceM: 150 }).elevations.size).toBe(0);
    // 600m を超えるものは採用しない
    expect(matchElevations([p], [t('far', '富士山', 'ふじさん', 35.3677, 138.7274)], opts).elevations.size).toBe(0);
  });

  it('assigns the mountain name of a multi-summit group only to a label right next to one summit (谷川岳)', () => {
    const g = (summit: string, lat: number, lon: number, elevationM: number) => pt({ name: '谷川岳', summitNames: [summit], altNames: [summit], lat, lon, elevationM });
    const points = [g('茂倉岳', 36.849166, 138.916666, 1978), g('一ノ倉岳', 36.847111, 138.924363, 1974), g('オキノ耳', 36.837115, 138.930157, 1977)];
    // 谷川岳の注記がオキノ耳から約150m → オキノ耳の標高
    expect(matchElevations(points, [t('tani', '谷川岳', 'たにがわだけ', 36.835779, 138.930331)], opts).elevations.get('tani')).toBe(1977);
    // 注記がどの峰からも 150m 以上離れていれば、どの峰の標高かを決められないので採用しない
    expect(matchElevations(points, [t('tani', '谷川岳', 'たにがわだけ', 36.8420, 138.9270)], opts).elevations.size).toBe(0);
  });
});
