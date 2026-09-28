import { averageRatings, mergeRatings, overallScore } from './ratings';
import { computePace } from './record';
import type { ClimbRecord, Course, ID, Mountain, MountainStatus, Ratings } from './types';
import { average, isFiniteNumber, newId, nowIso, uniq } from './util';

export const STATUS_LABEL: Record<MountainStatus, string> = {
  unclimbed: '未踏',
  climbed: '登頂済み',
  revisit: '再訪したい',
};

export const WISH_LABEL = ['—', '気になる', '行きたい', '次に行きたい'];

export function createMountain(partial: Partial<Mountain> = {}): Mountain {
  const now = nowIso();
  return {
    id: newId('mtn'),
    name: '',
    kana: '',
    region: '',
    prefectures: [],
    range: '',
    status: 'unclimbed',
    favorite: false,
    wish: 0,
    tagIds: [],
    courses: [],
    ratings: {},
    memo: '',
    links: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createCourse(partial: Partial<Course> = {}): Course {
  return { id: newId('crs'), name: '', ...partial };
}

/** 数値の出どころ（UI で「代表コース」「実績」などと表示するため） */
export type StatSource = 'course' | 'record' | 'none';

export interface ResolvedStat {
  value?: number;
  source: StatSource;
}

/**
 * 検索・並び替え・比較で使う、山ごとの派生情報。
 * 山そのものの情報と山行記録を合成して計算する（DB には保存しない）。
 */
export interface MountainView {
  mountain: Mountain;
  records: ClimbRecord[];
  climbCount: number;
  summitCount: number;
  lastClimbed?: string;
  firstClimbed?: string;
  /** 山のタグ ＋ 山行記録のタグ */
  tagIds: Set<ID>;
  elevationM?: number;
  distanceKm: ResolvedStat;
  ascentM: ResolvedStat;
  descentM: ResolvedStat;
  /** 標準コースタイム（分） */
  courseTimeMin: ResolvedStat;
  /** 実際の所要時間（最新の山行記録） */
  actualTimeMin?: number;
  /** 明示評価 → 山行記録平均 の順で補完した評価 */
  ratings: Ratings;
  overall?: number;
  isClimbed: boolean;
}

function latestFirst(records: ClimbRecord[]): ClimbRecord[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

function resolve(course: Course | undefined, recs: ClimbRecord[], pick: (x: Course | ClimbRecord) => number | undefined): ResolvedStat {
  const cv = course ? pick(course) : undefined;
  if (isFiniteNumber(cv)) return { value: cv, source: 'course' };
  for (const r of recs) {
    const rv = pick(r);
    if (isFiniteNumber(rv)) return { value: rv, source: 'record' };
  }
  return { source: 'none' };
}

export function buildMountainView(mountain: Mountain, allRecordsOfMountain: ClimbRecord[]): MountainView {
  const recs = latestFirst(allRecordsOfMountain);
  // 縦走の「ついで」の山は、コース数値の根拠にしない（メインの山の記録のみ使う）
  const mainRecs = recs.filter((r) => r.mountainIds[0] === mountain.id);
  const course = mountain.courses[0];
  const ratings = mergeRatings(mountain.ratings, averageRatings(recs.map((r) => r.ratings)));
  const tagIds = new Set<ID>(mountain.tagIds);
  recs.forEach((r) => r.tagIds.forEach((t) => tagIds.add(t)));
  const summitCount = recs.filter((r) => r.summitReached).length;
  return {
    mountain,
    records: recs,
    climbCount: recs.length,
    summitCount,
    lastClimbed: recs[0]?.date,
    firstClimbed: recs[recs.length - 1]?.date,
    tagIds,
    elevationM: mountain.elevationM,
    distanceKm: resolve(course, mainRecs, (x) => x.distanceKm),
    ascentM: resolve(course, mainRecs, (x) => x.ascentM),
    descentM: resolve(course, mainRecs, (x) => x.descentM),
    courseTimeMin: resolve(course, mainRecs, (x) => x.courseTimeMin),
    actualTimeMin: mainRecs.find((r) => isFiniteNumber(r.durationMin))?.durationMin,
    ratings,
    overall: overallScore(ratings),
    isClimbed: mountain.status !== 'unclimbed' || summitCount > 0,
  };
}

export function recordsByMountain(records: ClimbRecord[]): Map<ID, ClimbRecord[]> {
  const map = new Map<ID, ClimbRecord[]>();
  for (const r of records) {
    for (const id of uniq(r.mountainIds)) {
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(r);
    }
  }
  return map;
}

export function buildMountainViews(mountains: Mountain[], records: ClimbRecord[]): MountainView[] {
  const byM = recordsByMountain(records);
  return mountains.map((m) => buildMountainView(m, byM.get(m.id) ?? []));
}

/**
 * 自分の平均ペース（実所要時間 ÷ 標準コースタイム）。
 * 外れ値の影響を抑えるため中央値を使う。記録が無ければ undefined。
 */
export function personalPace(records: ClimbRecord[]): number | undefined {
  const ratios = records.map((r) => computePace(r)).filter(isFiniteNumber).sort((a, b) => a - b);
  if (ratios.length === 0) return undefined;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : average([ratios[mid - 1], ratios[mid]]);
}

/** 自分のペースでの予想所要時間（分） */
export function estimateMyTime(courseTimeMin: number | undefined, pace: number | undefined): number | undefined {
  if (!isFiniteNumber(courseTimeMin) || !isFiniteNumber(pace)) return undefined;
  return Math.round(courseTimeMin * pace);
}

/** 山行記録を追加したときの山ステータスの自動更新（未踏 → 登頂済み） */
export function statusAfterRecord(mountain: Mountain, record: ClimbRecord): MountainStatus {
  if (mountain.status === 'unclimbed' && record.summitReached) return 'climbed';
  return mountain.status;
}
