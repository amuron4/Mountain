import type { ClimbRecord } from './types';
import { isFiniteNumber, newId, nowIso, todayString } from './util';

export const WEATHER_OPTIONS = ['快晴', '晴れ', '晴れ時々曇り', '曇り', '霧・ガス', '小雨', '雨', '雪', '強風'];
export const TRAIL_OPTIONS = ['良好', '乾燥', '濡れ', 'ぬかるみ', '落ち葉', '凍結', '積雪', '残雪', '倒木あり'];
export const CROWD_OPTIONS = ['ほぼ貸切', '静か', '少なめ', '普通', '多い', '大混雑'];
export const TRANSPORT_OPTIONS = ['電車', 'バス', '車', 'タクシー', 'ロープウェイ', 'ケーブルカー', '自転車', '徒歩', 'レンタカー', '夜行バス'];

export function createRecord(partial: Partial<ClimbRecord> = {}): ClimbRecord {
  const now = nowIso();
  return {
    id: newId('rec'),
    mountainIds: [],
    date: todayString(),
    summitReached: true,
    courseName: '',
    start: '',
    goal: '',
    weather: '',
    trailCondition: '',
    crowd: '',
    transport: [],
    gear: '',
    companions: '',
    impressions: '',
    ratings: {},
    tagIds: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** 自分のペース = 実所要時間 ÷ 標準コースタイム（1.0 未満なら CT より速い） */
export function computePace(r: Pick<ClimbRecord, 'durationMin' | 'courseTimeMin'>): number | undefined {
  if (!isFiniteNumber(r.durationMin) || !isFiniteNumber(r.courseTimeMin) || r.courseTimeMin <= 0 || r.durationMin <= 0) {
    return undefined;
  }
  return r.durationMin / r.courseTimeMin;
}

export function describePace(ratio: number | undefined): string {
  if (!isFiniteNumber(ratio)) return '—';
  if (ratio < 0.8) return 'かなり速い';
  if (ratio < 0.95) return 'やや速い';
  if (ratio <= 1.05) return 'コースタイム通り';
  if (ratio <= 1.2) return 'ややゆっくり';
  return 'ゆっくり';
}

export function sortRecordsDesc(records: ClimbRecord[]): ClimbRecord[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
