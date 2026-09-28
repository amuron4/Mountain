import type { MountainView } from './mountain';
import { personalPace } from './mountain';
import type { ClimbRecord, Mountain } from './types';
import { isFiniteNumber } from './util';

export interface Summary {
  /** 登頂済み（または再訪したい）の山の数 */
  climbedMountains: number;
  unclimbedMountains: number;
  totalMountains: number;
  recordCount: number;
  totalDistanceKm: number;
  totalAscentM: number;
  totalDurationMin: number;
  highestClimbed?: { name: string; elevationM: number };
  pace?: number;
  thisYear: { records: number; distanceKm: number; ascentM: number };
}

export function computeSummary(views: MountainView[], records: ClimbRecord[], now = new Date()): Summary {
  const year = String(now.getFullYear());
  const climbed = views.filter((v) => v.isClimbed);
  let highest: Summary['highestClimbed'];
  for (const v of climbed) {
    if (isFiniteNumber(v.elevationM) && (!highest || v.elevationM > highest.elevationM)) {
      highest = { name: v.mountain.name, elevationM: v.elevationM };
    }
  }
  const sum = (rs: ClimbRecord[], pick: (r: ClimbRecord) => number | undefined) =>
    rs.reduce((acc, r) => acc + (isFiniteNumber(pick(r)) ? pick(r)! : 0), 0);
  const thisYearRecs = records.filter((r) => r.date.startsWith(year));
  return {
    climbedMountains: climbed.length,
    unclimbedMountains: views.length - climbed.length,
    totalMountains: views.length,
    recordCount: records.length,
    totalDistanceKm: sum(records, (r) => r.distanceKm),
    totalAscentM: sum(records, (r) => r.ascentM),
    totalDurationMin: sum(records, (r) => r.durationMin),
    highestClimbed: highest,
    pace: personalPace(records),
    thisYear: {
      records: thisYearRecs.length,
      distanceKm: sum(thisYearRecs, (r) => r.distanceKm),
      ascentM: sum(thisYearRecs, (r) => r.ascentM),
    },
  };
}

/** 年ごとの山行数・距離・累積標高（古い順） */
export function recordsByYear(records: ClimbRecord[]): { year: string; count: number; distanceKm: number; ascentM: number }[] {
  const map = new Map<string, { count: number; distanceKm: number; ascentM: number }>();
  for (const r of records) {
    const y = r.date.slice(0, 4);
    if (!/^\d{4}$/.test(y)) continue;
    const e = map.get(y) ?? { count: 0, distanceKm: 0, ascentM: 0 };
    e.count++;
    e.distanceKm += r.distanceKm ?? 0;
    e.ascentM += r.ascentM ?? 0;
    map.set(y, e);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, e]) => ({ year, ...e }));
}

export const ELEVATION_BANDS = [
  { label: '〜500m', min: 0, max: 500 },
  { label: '500〜1000m', min: 500, max: 1000 },
  { label: '1000〜1500m', min: 1000, max: 1500 },
  { label: '1500〜2000m', min: 1500, max: 2000 },
  { label: '2000〜2500m', min: 2000, max: 2500 },
  { label: '2500〜3000m', min: 2500, max: 3000 },
  { label: '3000m〜', min: 3000, max: Infinity },
];

/** 登頂済みの山の標高帯分布 */
export function elevationDistribution(views: MountainView[]): { label: string; count: number }[] {
  return ELEVATION_BANDS.map((b) => ({
    label: b.label,
    count: views.filter((v) => v.isClimbed && isFiniteNumber(v.elevationM) && v.elevationM >= b.min && v.elevationM < b.max).length,
  }));
}

/** ホーム「次に行きたい山」: 未踏/再訪で行きたい度が高い順 */
export function nextWishList(views: MountainView[], limit = 5): MountainView[] {
  return views
    .filter((v) => v.mountain.status !== 'climbed' && v.mountain.wish > 0)
    .sort((a, b) => b.mountain.wish - a.mountain.wish || b.mountain.updatedAt.localeCompare(a.mountain.updatedAt))
    .slice(0, limit);
}

export function unclimbedCandidates(views: MountainView[], limit = 5): MountainView[] {
  return views
    .filter((v) => v.mountain.status === 'unclimbed')
    .sort((a, b) => b.mountain.wish - a.mountain.wish || b.mountain.updatedAt.localeCompare(a.mountain.updatedAt))
    .slice(0, limit);
}

export function favorites(views: MountainView[], limit = 8): MountainView[] {
  return views
    .filter((v) => v.mountain.favorite)
    .sort((a, b) => (b.lastClimbed ?? '').localeCompare(a.lastClimbed ?? '') || a.mountain.name.localeCompare(b.mountain.name, 'ja'))
    .slice(0, limit);
}

export function mountainName(mountains: Map<string, Mountain>, id: string): string {
  return mountains.get(id)?.name ?? '（削除された山）';
}
