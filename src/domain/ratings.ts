import type { RatingKey, Ratings } from './types';
import { average, isFiniteNumber } from './util';

export interface RatingDef {
  key: RatingKey;
  label: string;
  /** 1 のときの意味 */
  low: string;
  /** 5 のときの意味 */
  high: string;
  /** 高いほど「大変」なのか（体力・技術・怖さ）、高いほど「良い」のか */
  kind: 'burden' | 'positive';
}

export const RATING_DEFS: RatingDef[] = [
  { key: 'stamina', label: '体力', low: '楽', high: 'きつい', kind: 'burden' },
  { key: 'technical', label: '技術', low: '易しい', high: '難しい', kind: 'burden' },
  { key: 'fear', label: '怖さ', low: '怖くない', high: '怖い', kind: 'burden' },
  { key: 'scenery', label: '景色', low: 'いまいち', high: '絶景', kind: 'positive' },
  { key: 'fun', label: '楽しさ', low: 'ふつう', high: '最高', kind: 'positive' },
  { key: 'revisit', label: 'また行きたい', low: 'もういい', high: '絶対また', kind: 'positive' },
  { key: 'affinity', label: '相性', low: '合わない', high: 'ぴったり', kind: 'positive' },
];

export const RATING_KEYS: RatingKey[] = RATING_DEFS.map((d) => d.key);

export function ratingDef(key: RatingKey): RatingDef {
  return RATING_DEFS.find((d) => d.key === key)!;
}

export function sanitizeRatings(input: unknown): Ratings {
  const out: Ratings = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of RATING_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (isFiniteNumber(v) && v >= 1 && v <= 5) out[key] = Math.round(v);
  }
  return out;
}

/** 複数の評価の項目ごとの平均（小数） */
export function averageRatings(list: Ratings[]): Ratings {
  const out: Ratings = {};
  for (const key of RATING_KEYS) {
    const avg = average(list.map((r) => r[key]).filter(isFiniteNumber));
    if (avg !== undefined) out[key] = avg;
  }
  return out;
}

/** 明示評価を優先し、未設定項目を fallback で補う */
export function mergeRatings(primary: Ratings, fallback: Ratings): Ratings {
  const out: Ratings = { ...fallback };
  for (const key of RATING_KEYS) {
    if (isFiniteNumber(primary[key])) out[key] = primary[key];
  }
  return out;
}

/** 「自分の評価」総合点: 景色・楽しさ・また行きたい・相性の平均 */
export function overallScore(r: Ratings): number | undefined {
  return average((['scenery', 'fun', 'revisit', 'affinity'] as RatingKey[]).map((k) => r[k]).filter(isFiniteNumber));
}
