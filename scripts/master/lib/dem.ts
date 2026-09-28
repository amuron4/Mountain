/**
 * 国土地理院 標高タイル（PNG形式）から、山名位置の標高を求める（ビルド時のみ使用）。
 *
 * - タイルの種類とズームは地理院地図（gsi-cyberjapan/gsimaps）の地点標高表示と同じ:
 *   DEM1A=z17, DEM5A/DEM5B/DEM5C=z15, DEM10B=z14。精度の高い順に試し、値が取れた最初のものを採用する。
 * - 7,826座に個別 API を叩くのではなく、座標から必要なタイルを計算し、同じタイルの山はまとめて1回だけ取得する。
 * - DEM1A は整備範囲が限られるため、まず z15 の DEM1A タイルで有無を確認し、無い地域では z17 を要求しない
 *   （国土地理院サーバーへの不要なアクセスを減らすため）。
 * - PNG の RGB → 標高の変換式は地理院地図のソースと同じ（無効値は RGB=(128,0,0)）。
 * - 値は「山名注記の位置の地形の標高」であり、公表されている山頂標高と一致するとは限らない（出典キーで区別する）。
 */
import { PNG } from 'pngjs';

export type DemKey = 'gsi-dem1a' | 'gsi-dem5a' | 'gsi-dem5b' | 'gsi-dem5c' | 'gsi-dem10b';

export interface DemSource {
  key: DemKey;
  label: string;
  /** タイル名（https://cyberjapandata.gsi.go.jp/xyz/{tileset}/{z}/{x}/{y}.png） */
  tileset: string;
  zoom: number;
  /** 取得前に存在確認に使う低ズーム（DEM1A のみ） */
  probeZoom?: number;
  /** おおよその格子間隔（m）。説明用 */
  resolutionM: number;
}

/** 精度の高い順（DEM1A → DEM5A → DEM5B → DEM5C → DEM10B） */
export const DEM_SOURCES: DemSource[] = [
  { key: 'gsi-dem1a', label: 'DEM1A', tileset: 'dem1a_png', zoom: 17, probeZoom: 15, resolutionM: 1 },
  { key: 'gsi-dem5a', label: 'DEM5A', tileset: 'dem5a_png', zoom: 15, resolutionM: 5 },
  { key: 'gsi-dem5b', label: 'DEM5B', tileset: 'dem5b_png', zoom: 15, resolutionM: 5 },
  { key: 'gsi-dem5c', label: 'DEM5C', tileset: 'dem5c_png', zoom: 15, resolutionM: 5 },
  { key: 'gsi-dem10b', label: 'DEM10B', tileset: 'dem_png', zoom: 14, resolutionM: 10 },
];

export const DEM_TILE_BASE = 'https://cyberjapandata.gsi.go.jp/xyz';

/** 日本の山として妥当な範囲（これを外れる値は異常として採用しない） */
export const DEM_VALID_RANGE = { min: -50, max: 4000 };

// ---------------------------------------------------------------------------
// タイル座標（Web メルカトル、256px タイル）
// ---------------------------------------------------------------------------

export interface TilePixel {
  z: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export function tilePixel(lat: number, lon: number, z: number): TilePixel {
  const n = 2 ** z * 256;
  const gx = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const gy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const fx = Math.floor(gx);
  const fy = Math.floor(gy);
  return { z, x: Math.floor(fx / 256), y: Math.floor(fy / 256), px: fx % 256, py: fy % 256 };
}

export const tileKey = (t: { z: number; x: number; y: number }) => `${t.z}/${t.x}/${t.y}`;

// ---------------------------------------------------------------------------
// PNG → 標高
// ---------------------------------------------------------------------------

/** 地理院 標高PNG の1画素を標高（m）に。無効値（128,0,0）や透明は undefined */
export function decodeElevation(r: number, g: number, b: number, a = 255): number | undefined {
  if (a === 0) return undefined;
  if (r === 128 && g === 0 && b === 0) return undefined;
  const d = r * 65536 + g * 256 + b;
  const h = d < 2 ** 23 ? d : d - 2 ** 24;
  return Math.round(h) / 100; // 0.01m 単位
}

export interface DecodedTile {
  width: number;
  height: number;
  data: Uint8Array;
}

export function decodeTilePng(buf: Uint8Array): DecodedTile {
  const png = PNG.sync.read(Buffer.from(buf));
  return { width: png.width, height: png.height, data: png.data };
}

export function elevationAt(tile: DecodedTile, px: number, py: number): number | undefined {
  if (px < 0 || py < 0 || px >= tile.width || py >= tile.height) return undefined;
  const i = (py * tile.width + px) * 4;
  return decodeElevation(tile.data[i], tile.data[i + 1], tile.data[i + 2], tile.data[i + 3]);
}

// ---------------------------------------------------------------------------
// 解決処理
// ---------------------------------------------------------------------------

/** タイルを返す（存在しない場合は undefined）。キャッシュ・アクセス間隔の制御は実装側で行う */
export type TileProvider = (tileset: string, z: number, x: number, y: number) => Promise<Uint8Array | undefined>;

export interface DemPoint {
  id: string;
  lat: number;
  lon: number;
}

export interface DemResult {
  elevationM: number;
  source: DemKey;
}

export interface DemStats {
  bySource: Record<DemKey, number>;
  unresolved: number;
  tilesRequested: number;
  tilesMissing: number;
  /** 値が妥当範囲外で捨てた数 */
  outOfRange: number;
}

export async function resolveDemElevations(
  points: DemPoint[],
  getTile: TileProvider,
  opts: { sources?: DemSource[]; onProgress?: (msg: string) => void } = {},
): Promise<{ results: Map<string, DemResult>; stats: DemStats }> {
  const sources = opts.sources ?? DEM_SOURCES;
  const results = new Map<string, DemResult>();
  const stats: DemStats = {
    bySource: { 'gsi-dem1a': 0, 'gsi-dem5a': 0, 'gsi-dem5b': 0, 'gsi-dem5c': 0, 'gsi-dem10b': 0 },
    unresolved: 0,
    tilesRequested: 0,
    tilesMissing: 0,
    outOfRange: 0,
  };
  const decoded = new Map<string, DecodedTile | null>();
  const load = async (tileset: string, z: number, x: number, y: number): Promise<DecodedTile | null> => {
    const key = `${tileset}/${z}/${x}/${y}`;
    if (decoded.has(key)) return decoded.get(key)!;
    stats.tilesRequested++;
    const buf = await getTile(tileset, z, x, y);
    let tile: DecodedTile | null = null;
    if (buf) {
      try {
        tile = decodeTilePng(buf);
      } catch {
        tile = null; // 壊れたタイルは「無し」と同じ扱い
      }
    }
    if (!tile) stats.tilesMissing++;
    decoded.set(key, tile);
    return tile;
  };

  let remaining = points;
  for (const src of sources) {
    // 1) 存在確認（DEM1A）: z15 タイルで値がある点だけを z17 で取得する
    let candidates = remaining;
    if (src.probeZoom !== undefined) {
      const kept: DemPoint[] = [];
      for (const group of groupByTile(remaining, src.probeZoom)) {
        const tile = await load(src.tileset, src.probeZoom, group.tile.x, group.tile.y);
        if (!tile) continue;
        for (const p of group.points) {
          const t = tilePixel(p.lat, p.lon, src.probeZoom);
          if (elevationAt(tile, t.px, t.py) !== undefined) kept.push(p);
        }
      }
      candidates = kept;
    }
    // 2) 本取得: 同じタイルの点はまとめて1回
    for (const group of groupByTile(candidates, src.zoom)) {
      const tile = await load(src.tileset, src.zoom, group.tile.x, group.tile.y);
      if (!tile) continue;
      for (const p of group.points) {
        const t = tilePixel(p.lat, p.lon, src.zoom);
        const h = elevationAt(tile, t.px, t.py);
        if (h === undefined) continue;
        if (h < DEM_VALID_RANGE.min || h > DEM_VALID_RANGE.max) {
          stats.outOfRange++;
          continue;
        }
        results.set(p.id, { elevationM: h, source: src.key });
        stats.bySource[src.key]++;
      }
    }
    remaining = remaining.filter((p) => !results.has(p.id));
    opts.onProgress?.(`${src.label}: ${stats.bySource[src.key]}座（残り ${remaining.length}、タイル要求 累計 ${stats.tilesRequested}）`);
    if (!remaining.length) break;
  }
  stats.unresolved = remaining.length;
  return { results, stats };
}

export function groupByTile(points: DemPoint[], z: number): { tile: TilePixel; points: DemPoint[] }[] {
  const map = new Map<string, { tile: TilePixel; points: DemPoint[] }>();
  for (const p of points) {
    const t = tilePixel(p.lat, p.lon, z);
    const k = tileKey(t);
    const g = map.get(k) ?? { tile: t, points: [] };
    g.points.push(p);
    map.set(k, g);
  }
  // 取得順を安定させる（キャッシュ再利用・差分確認のため）
  return [...map.values()].sort((a, b) => a.tile.x - b.tile.x || a.tile.y - b.tile.y);
}

/** 標高値の保存形式（0.1m 単位に丸める。UI では整数 m で表示） */
export function roundElevation(h: number): number {
  return Math.round(h * 10) / 10;
}
