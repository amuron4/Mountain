/**
 * anineco/GSI-VectorTile-MountainDB の gsi_summits.csv（国土地理院ベクトルタイルの山名注記）を
 * アプリ用の中間形式へ変換する。
 */
import { normalizeText } from '../../../src/domain/util';

export interface SummitRow {
  name: string;
  kana: string;
  aliases: string[];
  lat: number;
  lon: number;
}

const HIRAGANA_READING = /^[ぁ-ゟー・]+$/;

/**
 * 1行を変換する。
 * - 表示名は外字を正しい字形に置換した name1 を使い、元の代替表記（name）は検索用の別表記にする
 * - 読みがカンマ区切りで複数ある場合は先頭を主、残りを別表記にする
 */
export function toSummit(r: Record<string, string>): SummitRow | undefined {
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  const name = (r.name1 || r.name || '').trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) return undefined;
  const readings = (r.kana ?? '')
    .split(/[,、，]/)
    .map((s) => s.trim())
    .filter((s) => s && HIRAGANA_READING.test(s));
  const aliases: string[] = [];
  if (r.name && r.name.trim() && r.name.trim() !== name) aliases.push(r.name.trim());
  aliases.push(...readings.slice(1));
  return { name, kana: readings[0] ?? '', aliases: Array.from(new Set(aliases)), lat: round6(lat), lon: round6(lon) };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** FNV-1a 32bit を base36 で（ID の一部に使う） */
export function fnv1a36(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0');
}

/**
 * 決定的で、データ更新後も可能な限り安定する ID。
 * 座標（小数4桁 ≒ 約10m）＋正規化山名のハッシュ。同じ山の注記位置が大きく動かない限り変わらない。
 */
export function masterId(name: string, lat: number, lon: number): string {
  const la = Math.round(lat * 1e4);
  const lo = Math.round(lon * 1e4);
  return `g${la}${lo}${fnv1a36(normalizeText(name))}`;
}

/** 同名で近接（既定 50m 以内）の重複注記を1つにまとめる */
export function dedupeSummits<T extends SummitRow>(rows: T[], withinM = 50): { rows: T[]; removed: number } {
  const byName = new Map<string, T[]>();
  const out: T[] = [];
  let removed = 0;
  for (const r of rows) {
    const key = normalizeText(r.name);
    const list = byName.get(key) ?? [];
    const dup = list.find((x) => approxMeters(x.lat, x.lon, r.lat, r.lon) <= withinM);
    if (dup) {
      removed++;
      dup.aliases = Array.from(new Set([...dup.aliases, ...r.aliases, ...(r.kana && r.kana !== dup.kana ? [r.kana] : [])]));
      continue;
    }
    list.push(r);
    byName.set(key, list);
    out.push(r);
  }
  return { rows: out, removed };
}

export function approxMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const kx = 111_320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const dx = (lon2 - lon1) * kx;
  const dy = (lat2 - lat1) * 110_574;
  return Math.sqrt(dx * dx + dy * dy);
}
