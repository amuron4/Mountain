import type { MountainView } from './mountain';
import type { ID, MountainStatus, RatingKey, TagCategory, Tag } from './types';
import { isFiniteNumber, normalizeText } from './util';

export interface NumRange {
  min?: number;
  max?: number;
}

export interface MountainFilter {
  text: string;
  statuses: MountainStatus[];
  favoriteOnly: boolean;
  /** 行きたい度の下限（0 = 条件なし） */
  minWish: number;
  regions: string[];
  prefectures: string[];
  ranges: string[];
  elevationM: NumRange;
  distanceKm: NumRange;
  ascentM: NumRange;
  /** 標準コースタイム（時間単位で指定） */
  courseTimeH: NumRange;
  accessMaxMin?: number;
  /** 含めるタグ */
  includeTagIds: ID[];
  /** all = すべて含む / any = いずれかを含む */
  tagMode: 'all' | 'any';
  /** 除外するタグ（例: クマ、鎖場） */
  excludeTagIds: ID[];
  /** 評価の下限（例: 景色 4 以上） */
  minRatings: Partial<Record<RatingKey, number>>;
  /** 評価の上限（例: 怖さ 2 以下） */
  maxRatings: Partial<Record<RatingKey, number>>;
}

export function emptyFilter(): MountainFilter {
  return {
    text: '',
    statuses: [],
    favoriteOnly: false,
    minWish: 0,
    regions: [],
    prefectures: [],
    ranges: [],
    elevationM: {},
    distanceKm: {},
    ascentM: {},
    courseTimeH: {},
    includeTagIds: [],
    tagMode: 'all',
    excludeTagIds: [],
    minRatings: {},
    maxRatings: {},
  };
}

export interface FilterContext {
  tagsById: Map<ID, Tag>;
  categoriesById?: Map<ID, TagCategory>;
}

function inRange(v: number | undefined, r: NumRange, scale = 1): boolean {
  const hasMin = isFiniteNumber(r.min);
  const hasMax = isFiniteNumber(r.max);
  if (!hasMin && !hasMax) return true;
  if (!isFiniteNumber(v)) return false;
  if (hasMin && v < r.min! * scale) return false;
  if (hasMax && v > r.max! * scale) return false;
  return true;
}

/** 山の検索対象テキスト */
export function searchableText(v: MountainView, ctx: FilterContext): string {
  const m = v.mountain;
  const tagTexts = [...v.tagIds].flatMap((id) => {
    const t = ctx.tagsById.get(id);
    return t ? [t.label, ...(t.aliases ?? [])] : [];
  });
  return normalizeText(
    [
      m.name,
      m.kana,
      m.region,
      m.range,
      ...m.prefectures,
      m.memo,
      m.accessNote ?? '',
      ...m.courses.flatMap((c) => [c.name, c.start ?? '', c.goal ?? '']),
      ...v.records.flatMap((r) => [r.courseName, r.start, r.goal]),
      ...tagTexts,
    ].join(' '),
  );
}

export function matchesFilter(v: MountainView, f: MountainFilter, ctx: FilterContext): boolean {
  const m = v.mountain;
  if (f.statuses.length && !f.statuses.includes(m.status)) return false;
  if (f.favoriteOnly && !m.favorite) return false;
  if (f.minWish > 0 && m.wish < f.minWish) return false;
  if (f.regions.length && !f.regions.includes(m.region)) return false;
  if (f.prefectures.length && !m.prefectures.some((p) => f.prefectures.includes(p))) return false;
  if (f.ranges.length && !f.ranges.includes(m.range)) return false;
  if (!inRange(v.elevationM, f.elevationM)) return false;
  if (!inRange(v.distanceKm.value, f.distanceKm)) return false;
  if (!inRange(v.ascentM.value, f.ascentM)) return false;
  if (!inRange(v.courseTimeMin.value, f.courseTimeH, 60)) return false;
  if (isFiniteNumber(f.accessMaxMin) && !(isFiniteNumber(m.accessMinutes) && m.accessMinutes <= f.accessMaxMin)) return false;

  if (f.includeTagIds.length) {
    const ok =
      f.tagMode === 'all' ? f.includeTagIds.every((id) => v.tagIds.has(id)) : f.includeTagIds.some((id) => v.tagIds.has(id));
    if (!ok) return false;
  }
  if (f.excludeTagIds.some((id) => v.tagIds.has(id))) return false;

  for (const [key, min] of Object.entries(f.minRatings) as [RatingKey, number][]) {
    if (!isFiniteNumber(min)) continue;
    const r = v.ratings[key];
    if (!isFiniteNumber(r) || r < min) return false;
  }
  for (const [key, max] of Object.entries(f.maxRatings) as [RatingKey, number][]) {
    if (!isFiniteNumber(max)) continue;
    const r = v.ratings[key];
    if (!isFiniteNumber(r) || r > max) return false;
  }

  const q = f.text.trim();
  if (q) {
    const hay = searchableText(v, ctx);
    // スペース区切りは AND 検索
    const terms = q.split(/[\s　]+/).map(normalizeText).filter(Boolean);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function applyFilter(views: MountainView[], f: MountainFilter, ctx: FilterContext): MountainView[] {
  return views.filter((v) => matchesFilter(v, f, ctx));
}

/** 何個の条件が有効か（UI のバッジ表示用。テキストとステータスは別表示のため除く） */
export function countActiveConditions(f: MountainFilter): number {
  let n = 0;
  if (f.favoriteOnly) n++;
  if (f.minWish > 0) n++;
  n += f.regions.length ? 1 : 0;
  n += f.prefectures.length ? 1 : 0;
  n += f.ranges.length ? 1 : 0;
  for (const r of [f.elevationM, f.distanceKm, f.ascentM, f.courseTimeH]) {
    if (isFiniteNumber(r.min) || isFiniteNumber(r.max)) n++;
  }
  if (isFiniteNumber(f.accessMaxMin)) n++;
  n += f.includeTagIds.length + f.excludeTagIds.length;
  n += Object.values(f.minRatings).filter(isFiniteNumber).length;
  n += Object.values(f.maxRatings).filter(isFiniteNumber).length;
  return n;
}

// ---------------------------------------------------------------------------
// 数値のクイック条件（「10km以上」などをワンタップで）
// ---------------------------------------------------------------------------

export interface QuickNumericPreset {
  id: string;
  label: string;
  apply: (f: MountainFilter) => MountainFilter;
  isActive: (f: MountainFilter) => boolean;
}

export const QUICK_NUMERIC_PRESETS: QuickNumericPreset[] = [
  {
    id: 'dist10',
    label: '10km以上',
    apply: (f) => ({ ...f, distanceKm: { ...f.distanceKm, min: 10 } }),
    isActive: (f) => f.distanceKm.min === 10,
  },
  {
    id: 'asc1000',
    label: '累積1000m以上',
    apply: (f) => ({ ...f, ascentM: { ...f.ascentM, min: 1000 } }),
    isActive: (f) => f.ascentM.min === 1000,
  },
  {
    id: 'elev2000',
    label: '標高2000m以上',
    apply: (f) => ({ ...f, elevationM: { ...f.elevationM, min: 2000 } }),
    isActive: (f) => f.elevationM.min === 2000,
  },
  {
    id: 'long',
    label: 'ロング(CT7h以上)',
    apply: (f) => ({ ...f, courseTimeH: { ...f.courseTimeH, min: 7 } }),
    isActive: (f) => f.courseTimeH.min === 7,
  },
  {
    id: 'short',
    label: '短め(CT4h以下)',
    apply: (f) => ({ ...f, courseTimeH: { ...f.courseTimeH, max: 4 } }),
    isActive: (f) => f.courseTimeH.max === 4,
  },
];

// ---------------------------------------------------------------------------
// 並び替え
// ---------------------------------------------------------------------------

export type SortKey =
  | 'name'
  | 'elevation'
  | 'distance'
  | 'ascent'
  | 'courseTime'
  | 'lastClimbed'
  | 'climbCount'
  | 'overall'
  | 'wish'
  | 'updated'
  | `rating:${RatingKey}`;

export interface SortSpec {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { key: 'updated', label: '更新順', defaultDir: 'desc' },
  { key: 'name', label: '山名（読み）', defaultDir: 'asc' },
  { key: 'elevation', label: '標高', defaultDir: 'desc' },
  { key: 'distance', label: '距離', defaultDir: 'desc' },
  { key: 'ascent', label: '累積標高', defaultDir: 'desc' },
  { key: 'courseTime', label: 'コースタイム', defaultDir: 'desc' },
  { key: 'lastClimbed', label: '登山日（最新）', defaultDir: 'desc' },
  { key: 'climbCount', label: '登った回数', defaultDir: 'desc' },
  { key: 'overall', label: '自分の評価（総合）', defaultDir: 'desc' },
  { key: 'rating:revisit', label: 'また行きたい度', defaultDir: 'desc' },
  { key: 'wish', label: '行きたい度', defaultDir: 'desc' },
  { key: 'rating:scenery', label: '景色', defaultDir: 'desc' },
  { key: 'rating:fun', label: '楽しさ', defaultDir: 'desc' },
  { key: 'rating:stamina', label: '体力度', defaultDir: 'desc' },
  { key: 'rating:technical', label: '技術度', defaultDir: 'desc' },
  { key: 'rating:fear', label: '怖さ', defaultDir: 'desc' },
  { key: 'rating:affinity', label: '相性', defaultDir: 'desc' },
];

function sortValue(v: MountainView, key: SortKey): number | string | undefined {
  switch (key) {
    case 'name':
      return normalizeText(v.mountain.kana || v.mountain.name);
    case 'elevation':
      return v.elevationM;
    case 'distance':
      return v.distanceKm.value;
    case 'ascent':
      return v.ascentM.value;
    case 'courseTime':
      return v.courseTimeMin.value;
    case 'lastClimbed':
      return v.lastClimbed;
    case 'climbCount':
      return v.climbCount;
    case 'overall':
      return v.overall;
    case 'wish':
      return v.mountain.wish;
    case 'updated':
      return v.mountain.updatedAt;
    default: {
      const rk = key.slice('rating:'.length) as RatingKey;
      return v.ratings[rk];
    }
  }
}

/** 値が無いものは昇順・降順どちらでも末尾に置く */
export function sortViews(views: MountainView[], spec: SortSpec): MountainView[] {
  const sign = spec.dir === 'asc' ? 1 : -1;
  return [...views].sort((a, b) => {
    const av = sortValue(a, spec.key);
    const bv = sortValue(b, spec.key);
    const aMissing = av === undefined || av === '';
    const bMissing = bv === undefined || bv === '';
    if (aMissing && bMissing) return a.mountain.name.localeCompare(b.mountain.name, 'ja');
    if (aMissing) return 1;
    if (bMissing) return -1;
    let c: number;
    if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
    else c = String(av).localeCompare(String(bv), 'ja');
    if (c === 0) return a.mountain.name.localeCompare(b.mountain.name, 'ja');
    return c * sign;
  });
}
