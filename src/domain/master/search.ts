/**
 * 山マスターの検索インデックス。
 *
 * - 既存の normalizeText（全角/半角・カタカナ→ひらがな・ヶ/ケ など）を再利用して正規化する。
 * - 正規化は読み込み時に一度だけ行い、JSON には持たせない（データ容量を増やさないため）。
 * - 1万件程度なら単純な線形走査で 1〜2ms 程度。件数制限をかけて返すので描画も軽い。
 *
 * 並び順: 山名完全一致 → 読み完全一致 → 山名前方一致 → 読み前方一致 → 山名部分一致 → 読み部分一致
 *        → ゆるい一致（濁点・「ヶ」「ノ」の有無を無視）
 */
import { PREFECTURES_JIS } from '../geo';
import { normalizeText } from '../util';
import type { MountainMaster } from './types';

export const MATCH_RANK = {
  nameExact: 0,
  kanaExact: 1,
  namePrefix: 2,
  kanaPrefix: 3,
  namePartial: 4,
  kanaPartial: 5,
  loose: 6,
} as const;

export type MatchRank = (typeof MATCH_RANK)[keyof typeof MATCH_RANK];

interface Entry {
  m: MountainMaster;
  /** 正規化した山名 */
  n: string;
  /** 正規化した読み・別表記（先頭が主な読み） */
  k: string[];
  /** ゆるい比較用（濁点・ヶ・ノ などを除去） */
  loose: string[];
}

export interface MasterHit {
  master: MountainMaster;
  rank: MatchRank;
}

export interface MasterSearchOptions {
  prefectures?: string[];
  limit?: number;
  offset?: number;
}

export interface MasterSearchResult {
  hits: MasterHit[];
  /** 条件に一致した総数（limit 前） */
  total: number;
}

/** 濁点・半濁点を外し、「ヶ/ノ/ッ」などの有無の揺れを吸収する（最下位の一致に使う） */
export function looseKey(s: string): string {
  return normalizeText(s)
    .normalize('NFD')
    .replace(/[゙゚]/g, '')
    .normalize('NFC')
    .replace(/[けのがつっ]/g, '')
    .replace(/[ー・\-‐]/g, '');
}

function toEntry(m: MountainMaster): Entry {
  const n = normalizeText(m.name);
  const readings = [m.kana, ...(m.aliases ?? [])].filter(Boolean).map(normalizeText);
  const k = Array.from(new Set(readings));
  const loose = Array.from(new Set([n, ...k].map(looseKey).filter(Boolean)));
  return { m, n, k, loose };
}

function rankOf(e: Entry, q: string, lq: string): MatchRank | undefined {
  if (e.n === q) return MATCH_RANK.nameExact;
  if (e.k.includes(q)) return MATCH_RANK.kanaExact;
  if (e.n.startsWith(q)) return MATCH_RANK.namePrefix;
  if (e.k.some((k) => k.startsWith(q))) return MATCH_RANK.kanaPrefix;
  if (e.n.includes(q)) return MATCH_RANK.namePartial;
  if (e.k.some((k) => k.includes(q))) return MATCH_RANK.kanaPartial;
  if (lq.length >= 2 && e.loose.some((l) => l.includes(lq))) return MATCH_RANK.loose;
  return undefined;
}

// 並び替えは件数が多くなる（1文字検索で数千件）ため、localeCompare ではなく単純な比較で高速に行う。
// 読みはひらがななので、コードポイント順でほぼ五十音順になる。
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** 同名・同読みの山は都道府県コード順（北から南）に並べる */
const PREF_ORDER = new Map(PREFECTURES_JIS.map((p, i) => [p, i]));
const prefOrder = (m: MountainMaster) => PREF_ORDER.get(m.prefectures[0]) ?? 99;

function compareHits(a: MasterHit, b: MasterHit): number {
  return (
    a.rank - b.rank ||
    // 標高が分かる山（主要な山であることが多い）を先に
    (b.master.elevationM ?? -1) - (a.master.elevationM ?? -1) ||
    a.master.name.length - b.master.name.length ||
    cmp(a.master.kana, b.master.kana) ||
    prefOrder(a.master) - prefOrder(b.master) ||
    a.master.latitude - b.master.latitude
  );
}

export class MasterIndex {
  private entries: Entry[];
  private byIdMap: Map<string, MountainMaster>;

  constructor(items: MountainMaster[]) {
    this.entries = items.map(toEntry);
    this.byIdMap = new Map(items.map((m) => [m.id, m]));
  }

  get size(): number {
    return this.entries.length;
  }

  byId(id: string): MountainMaster | undefined {
    return this.byIdMap.get(id);
  }

  search(query: string, opts: MasterSearchOptions = {}): MasterSearchResult {
    const limit = opts.limit ?? 30;
    const offset = opts.offset ?? 0;
    const prefs = opts.prefectures?.length ? new Set(opts.prefectures) : undefined;
    const q = normalizeText(query);
    const hits: MasterHit[] = [];

    if (!q) {
      // 検索語なし: 都道府県を選んでいる場合のみ一覧（読み順）を返す
      if (!prefs) return { hits: [], total: 0 };
      for (const e of this.entries) {
        if (e.m.prefectures.some((p) => prefs.has(p))) hits.push({ master: e.m, rank: MATCH_RANK.loose });
      }
      hits.sort((a, b) => cmp(a.master.kana, b.master.kana) || a.master.latitude - b.master.latitude);
      return { hits: hits.slice(offset, offset + limit), total: hits.length };
    }

    const lq = looseKey(query);
    for (const e of this.entries) {
      if (prefs && !e.m.prefectures.some((p) => prefs.has(p))) continue;
      const rank = rankOf(e, q, lq);
      if (rank !== undefined) hits.push({ master: e.m, rank });
    }
    hits.sort(compareHits);
    return { hits: hits.slice(offset, offset + limit), total: hits.length };
  }
}
