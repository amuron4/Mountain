/**
 * 標高データ（国土地理院「日本の主な山岳標高」など）を山マスターへ安全に突合する。
 *
 * 方針（推測・捏造をしない）:
 * - 名前だけでは絶対に突合しない（「大山」「丸山」「御岳山」など同名の山が非常に多い）。
 * - 座標距離を最優先し、maxDistanceM 以内で、かつ山名または読みが一致するものだけを採用。
 * - 山名注記は山頂から少し離れて置かれることがあるため、farDistanceM までは
 *   「同名の山が近く（uniqueRadiusM）に他に無い」場合に限って採用する。
 * - 候補が複数あって一意に決められない場合は採用しない（標高は undefined のまま）。
 */
import { normalizeText } from '../../../src/domain/util';
import { decodeText, parseCsv } from './csv';
import { approxMeters } from './summits';

export interface ElevationPoint {
  name: string;
  /** 山名の別表記（括弧内の別名・＜＞内の山頂名など。読みも含む） */
  altNames: string[];
  kana?: string;
  /**
   * 「山名＜山頂名＞」形式の山頂名（とその別名・読み）。
   * 山頂名がある地点は「その山の中の1つの峰」の標高なので、山名側への当てはめを慎重にする。
   */
  summitNames?: string[];
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

const OPEN = '(<〈《';
const CLOSE = ')>〉》';
const INNERMOST = /[(<〈《]([^(<〈《)>〉》]+)[)>〉》]/;

/**
 * 「穂高岳（奥穂高岳）」「八ヶ岳＜赤岳＞」「蔵王山＜不忘山（御前岳）＞」→ 本名と別名（山頂名など）に分ける。
 * 国土地理院「日本の主な山岳標高」は「山名＜山頂名＞」「山名よみ＜山頂名よみ＞」の形式。括弧の入れ子にも対応。
 */
export function splitNames(raw: string): { name: string; alts: string[] } {
  const { name, nameAlts, summit, summitAlts } = parseMountainLabel(raw);
  return { name, alts: [...(summit ? [summit] : []), ...summitAlts, ...nameAlts] };
}

/**
 * 「山名（別名）＜山頂名（別名）＞」を構造的に分解する。
 * ＜＞ の中が山頂名、（）の中はその直前の名前の別名として扱う。
 */
export function parseMountainLabel(raw: string): { name: string; nameAlts: string[]; summit?: string; summitAlts: string[] } {
  // 「[南硫黄島]」のように名前全体が [] で囲まれたもの（島名で掲載）は中身を名前とする
  const s = raw.normalize('NFKC').trim().replace(/^\[(.+)\]$/, '$1');
  const angle = s.match(/^([^<〈《]*)[<〈《](.*)[>〉》]\s*$/);
  const head = angle ? angle[1] : s;
  const a = stripParens(head);
  if (!angle) return { name: a.base, nameAlts: a.inner, summitAlts: [] };
  const b = stripParens(angle[2]);
  return { name: a.base, nameAlts: a.inner, summit: b.base || undefined, summitAlts: b.inner };
}

/** 括弧を内側から順に取り除き、中身を別名として集める */
function stripParens(raw: string): { base: string; inner: string[] } {
  let s = raw;
  const inner: string[] = [];
  for (let m = s.match(INNERMOST); m; m = s.match(INNERMOST)) {
    inner.unshift(...m[1].split(/[・、,/]/).map((x) => x.trim()).filter(Boolean));
    s = s.slice(0, m.index) + s.slice(m.index! + m[0].length);
  }
  // 閉じていない括弧などの残りは取り除く
  const base = [...s].filter((ch) => !OPEN.includes(ch) && !CLOSE.includes(ch)).join('').trim();
  return { base, inner };
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
  const label = parseMountainLabel(String(get(nk) ?? ''));
  const name = label.name;
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
  const kl = kk ? parseMountainLabel(String(get(kk) ?? '')) : { name: '', nameAlts: [], summitAlts: [] as string[], summit: undefined };
  const kana = kl.name || undefined;
  const summitNames = label.summit ? [label.summit, ...label.summitAlts, ...(kl.summit ? [kl.summit] : []), ...kl.summitAlts] : undefined;
  const altNames = [...(summitNames ?? []), ...label.nameAlts, ...kl.nameAlts];
  return { name, altNames, kana, lat, lon, elevationM, ...(summitNames ? { summitNames } : {}) };
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
  /** この距離以内で名前が一致すれば採用する */
  maxDistanceM: number;
  /**
   * 山名注記が山頂から離れて置かれている場合の許容距離（既定は maxDistanceM と同じ＝拡張しない）。
   * maxDistanceM を超えて farDistanceM 以内の候補は、同じ名前の山マスターが地点から uniqueRadiusM 以内に
   * 他に無い場合だけ採用する。
   */
  farDistanceM?: number;
  uniqueRadiusM?: number;
}

export interface ElevationMatchResult {
  /** master id → 標高 */
  elevations: Map<string, number>;
  matched: number;
  /** そのうち maxDistanceM を超えて farDistanceM 以内で採用したもの（確認用） */
  far: { id: string; name: string; distanceM: number; elevationM: number }[];
  /** 近くに候補がない（地点数） */
  noCandidate: number;
  /** 近くにあるが名前・読みが一致しない（安全のため不採用・地点数） */
  nameMismatch: number;
  /** 一意に決められない（不採用） */
  ambiguous: number;
}

/** 突合専用の表記ゆれ吸収（峯/峰、嶽/岳、龍/竜、漢字間の ヶ/ケ/が） */
export function matchKey(s: string): string {
  const folded = s
    .normalize('NFKC')
    .replace(/峯/g, '峰')
    .replace(/嶽/g, '岳')
    .replace(/龍/g, '竜')
    .replace(/(?<=[\u4e00-\u9fff])[ヶケヵがか](?=[\u4e00-\u9fff])/g, 'が');
  return normalizeText(folded);
}

function namesOf(t: MatchTarget): Set<string> {
  return new Set([t.name, t.kana, ...t.aliases].filter(Boolean).map(matchKey));
}

const keysOf = (names: (string | undefined)[]) => new Set(names.filter((x): x is string => !!x).map(matchKey));

export function matchElevations(points: ElevationPoint[], targets: MatchTarget[], opts: ElevationMatchOptions): ElevationMatchResult {
  const nearM = opts.maxDistanceM;
  const farM = Math.max(nearM, opts.farDistanceM ?? nearM);
  const uniqueM = Math.max(farM, opts.uniqueRadiusM ?? farM);

  // 空間グリッドで近傍探索（セルは uniqueRadiusM 以上の大きさ）
  const step = Math.max(0.01, uniqueM / 70_000);
  const cell = (v: number) => Math.floor(v / step);
  const grid = new Map<string, MatchTarget[]>();
  for (const t of targets) {
    const k = `${cell(t.lat)},${cell(t.lon)}`;
    const list = grid.get(k) ?? [];
    list.push(t);
    grid.set(k, list);
  }
  const keyNames = new Map(targets.map((t) => [t.id, namesOf(t)]));
  const near = (lat: number, lon: number, radius: number) => {
    const out: { t: MatchTarget; d: number }[] = [];
    const la = cell(lat);
    const lo = cell(lon);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const t of grid.get(`${la + i},${lo + j}`) ?? []) {
          const d = approxMeters(lat, lon, t.lat, t.lon);
          if (d <= radius) out.push({ t, d });
        }
    return out.sort((a, b) => a.d - b.d);
  };

  // 同じ山名の地点が近くに複数ある（例: 谷川岳＜茂倉岳＞・＜一ノ倉岳＞・＜オキノ耳＞）
  // → 山名側（「谷川岳」）は山頂のすぐ近くの注記にだけ当てはめる
  const groupSize = (p: ElevationPoint) => {
    const k = matchKey(p.name);
    return points.filter((q) => matchKey(q.name) === k && approxMeters(p.lat, p.lon, q.lat, q.lon) <= 20_000).length;
  };

  const proposals = new Map<string, { point: ElevationPoint; distance: number }[]>();
  let noCandidate = 0;
  let nameMismatch = 0;
  let ambiguous = 0;
  for (const p of points) {
    const around = near(p.lat, p.lon, uniqueM);
    if (!around.some((x) => x.d <= farM)) {
      noCandidate++;
      continue;
    }
    // 名前の種類ごとに許容距離を決める
    const summitKeys = keysOf(p.summitNames ?? []);
    const mountainKeys = keysOf([p.name, p.kana, ...p.altNames]);
    for (const k of summitKeys) mountainKeys.delete(k);
    const mountainFarOk = !p.summitNames?.length || groupSize(p) === 1;
    const groups: { keys: Set<string>; limit: number }[] = [
      { keys: summitKeys, limit: farM },
      { keys: mountainKeys, limit: mountainFarOk ? farM : nearM },
    ];

    let proposed = 0;
    let amb = 0;
    const seen = new Set<string>();
    for (const g of groups)
      for (const key of g.keys) {
        const same = around.filter((x) => keyNames.get(x.t.id)!.has(key));
        if (!same.length || same[0].d > g.limit) continue;
        const best = same[0];
        // 同名の候補が2つ以上あり距離で区別できない / 遠めの採用なのに同名の山が近くにもう1つある → 不採用
        if (same.length > 1 && (same[1].d - best.d < 30 || best.d > nearM)) {
          amb++;
          continue;
        }
        if (seen.has(best.t.id)) continue;
        seen.add(best.t.id);
        const list = proposals.get(best.t.id) ?? [];
        list.push({ point: p, distance: best.d });
        proposals.set(best.t.id, list);
        proposed++;
      }
    if (!proposed) {
      if (amb) ambiguous++;
      else nameMismatch++;
    }
  }

  const elevations = new Map<string, number>();
  const far: ElevationMatchResult['far'] = [];
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const [id, list] of proposals) {
    list.sort((a, b) => a.distance - b.distance);
    // 1つのマスターに異なる標高の点が複数対応し、距離でも区別できない場合は不採用
    if (list.length > 1 && list[0].point.elevationM !== list[1].point.elevationM && list[1].distance - list[0].distance < 30) {
      ambiguous++;
      continue;
    }
    const best = list[0];
    elevations.set(id, best.point.elevationM);
    if (best.distance > nearM) far.push({ id, name: byId.get(id)!.name, distanceM: Math.round(best.distance), elevationM: best.point.elevationM });
  }
  far.sort((a, b) => a.distanceM - b.distanceM);
  return { elevations, matched: elevations.size, far, noCandidate, nameMismatch, ambiguous };
}
