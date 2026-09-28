/**
 * 標高データ（国土地理院「日本の主な山岳標高」など）を山マスターへ安全に突合する。
 *
 * 方針（推測・捏造をしない）:
 * - 名前だけでは絶対に突合しない（「大山」「丸山」「御岳山」など同名の山が非常に多い）。
 * - 座標距離を最優先し、maxDistanceM 以内で、かつ山名または読みが一致するものだけを採用。
 * - 候補が複数あって一意に決められない場合は採用しない（標高は undefined のまま）。
 */
import { normalizeText } from '../../../src/domain/util';
import { decodeText, parseCsv } from './csv';
import { approxMeters } from './summits';

export interface ElevationPoint {
  name: string;
  /** 山名の別表記（括弧内の峰名など） */
  altNames: string[];
  kana?: string;
  lat: number;
  lon: number;
  elevationM: number;
}

// ---------------------------------------------------------------------------
// 座標・数値の解析
// ---------------------------------------------------------------------------

/** 10進数 / 度分秒（35°21′39″, 35度21分39秒, 35:21:39, 352139 など）を10進度へ */
export function parseCoordinate(raw: string): number | undefined {
  const s = raw.normalize('NFKC').trim();
  if (!s) return undefined;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Math.abs(n) <= 180) return n;
    // DDDMMSS(.s) 形式（例: 352139, 1384338.5）
    const m = s.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)$/);
    if (m) return Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
    return undefined;
  }
  const parts = s.match(/(\d+(?:\.\d+)?)/g);
  if (!parts || parts.length < 2 || parts.length > 3) return undefined;
  const [d, m, sec = '0'] = parts;
  const v = Number(d) + Number(m) / 60 + Number(sec) / 3600;
  return Number.isFinite(v) ? v : undefined;
}

export function parseElevation(raw: string | number | undefined): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 && raw < 4000 ? raw : undefined;
  if (!raw) return undefined;
  const s = raw.normalize('NFKC').replace(/[,\s]/g, '').replace(/m$/i, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n > 0 && n < 4000 ? n : undefined;
}

/**
 * 「穂高岳（奥穂高岳）」「八ヶ岳＜赤岳＞」→ 本名と別名（山頂名など）に分ける。
 * 国土地理院「日本の主な山岳標高」は「山名＜山頂名＞」「山名よみ＜山頂名よみ＞」の形式。
 */
export function splitNames(raw: string): { name: string; alts: string[] } {
  const s = raw.normalize('NFKC').trim();
  const alts: string[] = [];
  const base = s
    .replace(/[(<〈《]([^)>〉》]+)[)>〉》]/g, (_, inner: string) => {
      alts.push(...inner.split(/[・、,/]/).map((x) => x.trim()).filter(Boolean));
      return '';
    })
    .trim();
  return { name: base, alts };
}

// ---------------------------------------------------------------------------
// ファイル形式の自動判定（列名が版によって違っても読めるように）
// ---------------------------------------------------------------------------

function findKey(keys: string[], patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const k = keys.find((x) => p.test(x));
    if (k) return k;
  }
  return undefined;
}

const NAME_KEYS = [/^山名$/, /山名(?!.*(読|よみ|ふりがな|かな))/, /^名称$/, /^name$/i];
const KANA_KEYS = [/読み|よみ|ふりがな|フリガナ|かな/, /^(kana|yomi)$/i];
const ELEV_KEYS = [/標高/, /^(elevation|ele|alt|altitude)$/i];
const LAT_KEYS = [/緯度/, /^lat(itude)?$/i];
const LON_KEYS = [/経度/, /^(lon|lng|longitude)$/i];

function rowToPoint(get: (k: string) => string | number | undefined, keys: string[], coords?: [number, number]): ElevationPoint | undefined {
  const nk = findKey(keys, NAME_KEYS);
  const ek = findKey(keys, ELEV_KEYS);
  if (!nk || !ek) return undefined;
  const rawName = String(get(nk) ?? '');
  const { name, alts } = splitNames(rawName);
  const elevationM = parseElevation(get(ek) as string);
  let lat: number | undefined;
  let lon: number | undefined;
  if (coords) [lon, lat] = coords;
  else {
    const la = findKey(keys, LAT_KEYS);
    const lo = findKey(keys, LON_KEYS);
    if (la && lo) {
      lat = parseCoordinate(String(get(la) ?? ''));
      lon = parseCoordinate(String(get(lo) ?? ''));
    }
  }
  if (!name || elevationM === undefined || lat === undefined || lon === undefined) return undefined;
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) return undefined;
  const kk = findKey(keys, KANA_KEYS);
  // 読みも「山名よみ＜山頂名よみ＞」形式なので分けて、山頂名の読みも照合に使う
  const kanaParts = kk ? splitNames(String(get(kk) ?? '')) : { name: '', alts: [] };
  const kana = kanaParts.name || undefined;
  return { name, altNames: [...alts, ...kanaParts.alts], kana, lat, lon, elevationM };
}

/** CSV（UTF-8 / Shift_JIS）または GeoJSON を読み込む。ヘッダー行が先頭でない CSV にも対応 */
export function parseElevationFile(buf: Uint8Array, fileName: string): { points: ElevationPoint[]; skipped: number; hasCoordinates: boolean } {
  const text = decodeText(buf);
  if (/\.(geo)?json$/i.test(fileName)) {
    const json = JSON.parse(text) as { features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: number[] } }[] };
    const points: ElevationPoint[] = [];
    let skipped = 0;
    for (const f of json.features ?? []) {
      const props = f.properties ?? {};
      const coords = f.geometry?.type === 'Point' ? (f.geometry.coordinates.slice(0, 2) as [number, number]) : undefined;
      const p = rowToPoint((k) => props[k] as string | number | undefined, Object.keys(props), coords);
      if (p) points.push(p);
      else skipped++;
    }
    return { points, skipped, hasCoordinates: true };
  }
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex((r) => findKey(r, NAME_KEYS) && findKey(r, ELEV_KEYS));
  if (headerIdx < 0) throw new Error('標高データの列（山名・標高）を判定できませんでした');
  const header = rows[headerIdx].map((h) => h.trim());
  // 座標の列が無い CSV は、名前だけの突合になってしまうため使わない（GeoJSON 版を使う）
  const hasCoordinates = !!findKey(header, LAT_KEYS) && !!findKey(header, LON_KEYS);
  if (!hasCoordinates) return { points: [], skipped: rows.length - headerIdx - 1, hasCoordinates };
  const points: ElevationPoint[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const p = rowToPoint((k) => r[header.indexOf(k)], header);
    if (p) points.push(p);
    else skipped++;
  }
  return { points, skipped, hasCoordinates };
}

// ---------------------------------------------------------------------------
// 突合
// ---------------------------------------------------------------------------

export interface MatchTarget {
  id: string;
  name: string;
  kana: string;
  aliases: string[];
  lat: number;
  lon: number;
}

export interface ElevationMatchOptions {
  /** この距離以内の候補だけを見る */
  maxDistanceM: number;
}

export interface ElevationMatchResult {
  /** master id → 標高 */
  elevations: Map<string, number>;
  matched: number;
  /** 近くに候補がない */
  noCandidate: number;
  /** 近くにあるが名前・読みが一致しない（安全のため不採用） */
  nameMismatch: number;
  /** 一意に決められない（不採用） */
  ambiguous: number;
}

function namesOf(t: MatchTarget): Set<string> {
  return new Set([t.name, t.kana, ...t.aliases].filter(Boolean).map(normalizeText));
}

function pointNames(p: ElevationPoint): Set<string> {
  return new Set([p.name, ...p.altNames, ...(p.kana ? [p.kana] : [])].filter(Boolean).map(normalizeText));
}

export function matchElevations(points: ElevationPoint[], targets: MatchTarget[], opts: ElevationMatchOptions): ElevationMatchResult {
  // 空間グリッド（約0.01度）で近傍探索
  const cell = (lat: number, lon: number) => `${Math.floor(lat * 100)},${Math.floor(lon * 100)}`;
  const grid = new Map<string, MatchTarget[]>();
  for (const t of targets) {
    const k = cell(t.lat, t.lon);
    const list = grid.get(k) ?? [];
    list.push(t);
    grid.set(k, list);
  }
  const near = (lat: number, lon: number): MatchTarget[] => {
    const out: MatchTarget[] = [];
    const la = Math.floor(lat * 100);
    const lo = Math.floor(lon * 100);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${la + i},${lo + j}`) ?? []));
    return out;
  };

  // 標高点 → 採用候補のマスター
  const proposals = new Map<string, { point: ElevationPoint; distance: number }[]>();
  let noCandidate = 0;
  let nameMismatch = 0;
  let ambiguous = 0;
  for (const p of points) {
    const within = near(p.lat, p.lon)
      .map((t) => ({ t, d: approxMeters(p.lat, p.lon, t.lat, t.lon) }))
      .filter((x) => x.d <= opts.maxDistanceM);
    if (!within.length) {
      noCandidate++;
      continue;
    }
    const pn = pointNames(p);
    const named = within.filter((x) => [...namesOf(x.t)].some((n) => pn.has(n)));
    if (!named.length) {
      nameMismatch++;
      continue;
    }
    named.sort((a, b) => a.d - b.d);
    // 同名の候補が2つ以上あり、距離でも明確に区別できない場合は不採用
    if (named.length > 1 && named[1].d - named[0].d < 30) {
      ambiguous++;
      continue;
    }
    const best = named[0];
    const list = proposals.get(best.t.id) ?? [];
    list.push({ point: p, distance: best.d });
    proposals.set(best.t.id, list);
  }

  const elevations = new Map<string, number>();
  for (const [id, list] of proposals) {
    list.sort((a, b) => a.distance - b.distance);
    // 1つのマスターに異なる標高の点が複数対応し、距離でも区別できない場合は不採用
    if (list.length > 1 && list[0].point.elevationM !== list[1].point.elevationM && list[1].distance - list[0].distance < 30) {
      ambiguous++;
      continue;
    }
    elevations.set(id, list[0].point.elevationM);
  }
  return { elevations, matched: elevations.size, noCandidate, nameMismatch, ambiguous };
}
