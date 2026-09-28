import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { representativeReport } from '../elevation';
import { decodeElevation, DEM_SOURCES, groupByTile, resolveDemElevations, roundElevation, tilePixel, type TileProvider } from './dem';
import { countBySource, readElevationStore, writeElevationStore } from './elevationStore';
import { findCsvLinks } from './official';
import { TileFetcher } from './tileFetcher';

/** 地理院 標高PNG の符号化（テスト用。decodeElevation の逆） */
function encode(h: number | undefined): [number, number, number] {
  if (h === undefined) return [128, 0, 0];
  let d = Math.round(h * 100);
  if (d < 0) d += 2 ** 24;
  return [(d >> 16) & 255, (d >> 8) & 255, d & 255];
}

/** 全画素を同じ標高にしたタイル（ただし overrides で特定画素を上書き） */
function tilePng(h: number | undefined, overrides: { px: number; py: number; h: number | undefined }[] = []): Uint8Array {
  const png = new PNG({ width: 256, height: 256 });
  const fill = encode(h);
  for (let i = 0; i < 256 * 256; i++) png.data.set([...fill, 255], i * 4);
  for (const o of overrides) png.data.set([...encode(o.h), 255], (o.py * 256 + o.px) * 4);
  return new Uint8Array(PNG.sync.write(png));
}

describe('DEM tile math and decoding', () => {
  it('computes tile and pixel (web mercator)', () => {
    expect(tilePixel(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1, px: 0, py: 0 });
    const t = tilePixel(35.9516, 139.0978, 15);
    // 画素中心を逆変換すると元の点から 1 画素（約 4m）以内
    const n = 2 ** 15 * 256;
    const lon = ((t.x * 256 + t.px + 0.5) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y * 256 + t.py + 0.5)) / n))) * 180) / Math.PI;
    expect(Math.abs(lon - 139.0978) * 90_000).toBeLessThan(5);
    expect(Math.abs(lat - 35.9516) * 111_000).toBeLessThan(5);
    expect(tilePixel(35.9516, 139.0978, 17).x >> 2).toBe(t.x); // z17 タイルは z15 タイルの内側
  });

  it('decodes GSI elevation PNG values like 地理院地図', () => {
    expect(decodeElevation(...encode(1304.56))).toBe(1304.56);
    expect(decodeElevation(...encode(0))).toBe(0);
    expect(decodeElevation(...encode(-1.5))).toBe(-1.5);
    expect(decodeElevation(...encode(3776.24))).toBe(3776.24);
    expect(decodeElevation(128, 0, 0)).toBeUndefined(); // 無効値
    expect(decodeElevation(1, 2, 3, 0)).toBeUndefined(); // 透明
    expect(roundElevation(1303.87)).toBe(1303.9);
  });

  it('groups points that share a tile', () => {
    const pts = [
      { id: 'a', lat: 35.9516, lon: 139.0978 },
      { id: 'b', lat: 35.9517, lon: 139.0979 },
      { id: 'c', lat: 36.8358, lon: 138.9303 },
    ];
    const g = groupByTile(pts, 15);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.points.length === 2)!.points.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });
});

describe('resolveDemElevations (priority DEM1A → DEM5A → DEM5B → DEM5C → DEM10B)', () => {
  // 5座を別々の z15 タイルに置く
  const P = {
    dem1a: { id: 'dem1a', lat: 35.9516, lon: 139.0978 },
    dem5a: { id: 'dem5a', lat: 36.8358, lon: 138.9303 },
    dem5aTwin: { id: 'dem5aTwin', lat: 36.8359, lon: 138.9304 }, // dem5a と同じタイル
    dem5b: { id: 'dem5b', lat: 35.9709, lon: 138.3702 },
    dem10b: { id: 'dem10b', lat: 35.3606, lon: 138.7274 },
    none: { id: 'none', lat: 36.342, lon: 137.6477 },
    weird: { id: 'weird', lat: 35.6251, lon: 139.2437 },
  };
  const key = (ts: string, z: number, p: { lat: number; lon: number }) => {
    const t = tilePixel(p.lat, p.lon, z);
    return `${ts}/${z}/${t.x}/${t.y}`;
  };
  const px = (p: { lat: number; lon: number }, z: number) => tilePixel(p.lat, p.lon, z);
  const tiles = new Map<string, Uint8Array>([
    // DEM1A: 存在確認タイル(z12)と本取得タイル(z17)
    [key('dem1a_png', 12, P.dem1a), tilePng(1300)],
    [key('dem1a_png', 17, P.dem1a), tilePng(1300, [{ ...px(P.dem1a, 17), h: 1303.62 }])],
    // DEM5A: dem5a と dem5aTwin は同じタイル
    [key('dem5a_png', 15, P.dem5a), tilePng(1970.44)],
    // DEM5A はあるが dem5b 地点の画素は無効値 → DEM5B で補う
    [key('dem5a_png', 15, P.dem5b), tilePng(2800, [{ ...px(P.dem5b, 15), h: undefined }])],
    [key('dem5b_png', 15, P.dem5b), tilePng(2890.1)],
    [key('dem_png', 14, P.dem10b), tilePng(3765.2)],
    // 妥当範囲外の値は採用しない
    [key('dem5a_png', 15, P.weird), tilePng(9999)],
  ]);

  it('uses the most precise available DEM, fetches each tile once, and never guesses', async () => {
    const requested: string[] = [];
    const provider: TileProvider = async (ts, z, x, y) => {
      const k = `${ts}/${z}/${x}/${y}`;
      requested.push(k);
      return tiles.get(k);
    };
    const { results, stats } = await resolveDemElevations(Object.values(P), provider);

    expect(results.get('dem1a')).toEqual({ elevationM: 1303.62, source: 'gsi-dem1a' });
    expect(results.get('dem5a')).toEqual({ elevationM: 1970.44, source: 'gsi-dem5a' });
    expect(results.get('dem5aTwin')).toEqual({ elevationM: 1970.44, source: 'gsi-dem5a' });
    expect(results.get('dem5b')).toEqual({ elevationM: 2890.1, source: 'gsi-dem5b' });
    expect(results.get('dem10b')).toEqual({ elevationM: 3765.2, source: 'gsi-dem10b' });
    expect(results.has('none')).toBe(false);
    expect(results.has('weird')).toBe(false);
    expect(stats.outOfRange).toBe(1);
    expect(stats.unresolved).toBe(2);
    expect(stats.bySource).toMatchObject({ 'gsi-dem1a': 1, 'gsi-dem5a': 2, 'gsi-dem5b': 1, 'gsi-dem5c': 0, 'gsi-dem10b': 1 });

    // 同じタイルは1回しか要求しない
    expect(new Set(requested).size).toBe(requested.length);
    // DEM1A の存在確認で無かった地域には z17 を要求しない
    expect(requested.filter((r) => r.startsWith('dem1a_png/17/'))).toEqual([key('dem1a_png', 17, P.dem1a)]);
    // DEM1A で取れた山には、それ以降の DEM を要求しない
    expect(requested).not.toContain(key('dem5a_png', 15, P.dem1a));
  });

  it('treats undecodable tiles as missing', async () => {
    const { results, stats } = await resolveDemElevations([P.dem5a], async () => new Uint8Array([1, 2, 3]));
    expect(results.size).toBe(0);
    expect(stats.tilesMissing).toBe(stats.tilesRequested);
  });

  it('has sources in the required order', () => {
    expect(DEM_SOURCES.map((s) => `${s.label}@${s.zoom}`)).toEqual(['DEM1A@17', 'DEM5A@15', 'DEM5B@15', 'DEM5C@15', 'DEM10B@14']);
    expect(DEM_SOURCES[0].probeZoom).toBe(12);
  });
});

describe('TileFetcher (polite access)', () => {
  const mk = (responses: Record<string, number>, extra: Partial<ConstructorParameters<typeof TileFetcher>[0]> = {}) => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'dem-cache-'));
    const calls: string[] = [];
    const sleeps: number[] = [];
    let clock = 0;
    const png = tilePng(100);
    const fetcher = new TileFetcher({
      cacheDir,
      minIntervalMs: 300,
      fetchImpl: (async (url: string) => {
        calls.push(url);
        const status = responses[url.split('/xyz/')[1]] ?? 200;
        return new Response(status === 200 ? Buffer.from(png) : null, { status });
      }) as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
      ...extra,
    });
    return { fetcher, calls, sleeps, cacheDir };
  };

  it('caches tiles and 404s on disk and never re-requests them', async () => {
    const { fetcher, calls, cacheDir } = mk({ 'dem5a_png/15/2/2.png': 404 });
    expect(await fetcher.get('dem5a_png', 15, 1, 1)).toBeInstanceOf(Uint8Array);
    expect(await fetcher.get('dem5a_png', 15, 2, 2)).toBeUndefined();
    expect(await fetcher.get('dem5a_png', 15, 1, 1)).toBeInstanceOf(Uint8Array);
    expect(await fetcher.get('dem5a_png', 15, 2, 2)).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(existsSync(join(cacheDir, 'dem5a_png/15/2/2.missing'))).toBe(true);
    // 別インスタンス（再実行）でもキャッシュを使う
    const again = new TileFetcher({ cacheDir, fetchImpl: (async () => { throw new Error('network used'); }) as typeof fetch });
    expect(await again.get('dem5a_png', 15, 1, 1)).toBeInstanceOf(Uint8Array);
    expect(await again.get('dem5a_png', 15, 2, 2)).toBeUndefined();
  });

  it('keeps a minimum interval between requests (sequential)', async () => {
    const { fetcher, sleeps } = mk({});
    for (let i = 0; i < 4; i++) await fetcher.get('dem_png', 14, i, 0);
    expect(sleeps.filter((s) => s > 0)).toEqual([300, 300, 300]);
  });

  it('stops immediately on 403 and gives up after repeated server errors', async () => {
    const forbidden = mk({ 'dem5a_png/15/1/1.png': 403 });
    await expect(forbidden.fetcher.get('dem5a_png', 15, 1, 1)).rejects.toThrow(/403/);
    expect(forbidden.calls).toHaveLength(1);

    const flaky = mk({ 'dem5a_png/15/1/1.png': 503 }, { maxRetries: 2, maxConsecutiveErrors: 10 });
    await expect(flaky.fetcher.get('dem5a_png', 15, 1, 1)).rejects.toThrow(/503/);
    expect(flaky.calls).toHaveLength(3); // 初回＋再試行2回だけ
    expect(flaky.fetcher.stats.retries).toBe(2);
  });

  it('offline mode never touches the network', async () => {
    const { fetcher, calls } = mk({}, { offline: true });
    expect(await fetcher.get('dem5a_png', 15, 9, 9)).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(fetcher.stats.skippedOffline).toBe(1);
  });
});

describe('official CSV link discovery and elevation store', () => {
  it('finds the mountain elevation CSV link on the official page', () => {
    const html = `
      <a href="/common/000999999.csv">都道府県の最高地点（CSV）</a>
      <a href="../common/000123456.csv"><span>日本の主な山岳標高一覧（1003山）【CSV形式：79KB】</span></a>
      <a href="/common/000123457.geojson">GeoJSON</a>`;
    const links = findCsvLinks(html, 'https://www.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html');
    expect(links[0].url).toBe('https://www.gsi.go.jp/common/000123456.csv');
    expect(links).toHaveLength(2);
  });

  it('round-trips elevations.json with stable ordering and validates sources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'elev-'));
    const path = join(dir, 'elevations.json');
    expect(readElevationStore(path).items).toEqual({});
    writeElevationStore(path, { format: 1, updatedAt: '2026-09-28T00:00:00.000Z', stats: {}, items: { b: [1304, 'gsi-sangaku'], a: [1970.4, 'gsi-dem5a'] } });
    const back = readElevationStore(path);
    expect(Object.keys(back.items)).toEqual(['a', 'b']);
    expect(countBySource(back.items)).toMatchObject({ 'gsi-sangaku': 1, 'gsi-dem5a': 1, 'gsi-dem1a': 0 });
    expect(readdirSync(dir)).toEqual(['elevations.json']);
  });

  it('flags representative mountains whose values look wrong', () => {
    const m = (id: string, name: string, lat: number, lon: number) => ({ id, name, kana: '', latitude: lat, longitude: lon, prefectures: ['埼玉県'], source: 'x' });
    const masters = [m('buko', '武甲山', 35.9516, 139.0978), m('ryo', '両神山', 36.0234, 138.8412), m('kumo', '雲取山', 35.8556, 138.9439)];
    const r = representativeReport(masters, { buko: [1301.2, 'gsi-dem5a'], ryo: [1500, 'gsi-dem5a'], kumo: [2017, 'gsi-sangaku'] });
    expect(r.lines.find((l) => l.includes('武甲山'))).not.toContain('要確認');
    expect(r.lines.find((l) => l.includes('両神山'))).toContain('要確認');
    expect(r.lines.find((l) => l.includes('富士山'))).toContain('見つかりません');
    expect(r.warnings).toBe(1);
  });
});
