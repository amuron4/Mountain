/**
 * 2〜3座の比較表を組み立てる（UI 非依存）。
 */
import { formatDuration, formatKm, formatMeters } from './format';
import { estimateMyTime, STATUS_LABEL, type MountainView } from './mountain';
import { ACCESS_CATEGORY_KEYS, AFTER_CATEGORY_KEYS, categoryId, DANGER_CATEGORY_KEYS, FEATURE_CATEGORY_KEYS } from './presets';
import type { TagIndex } from './tags';
import type { ID } from './types';
import { isFiniteNumber } from './util';

export type CompareCell =
  | { kind: 'number'; value?: number; text: string; best?: boolean }
  | { kind: 'rating'; value?: number; text: string; best?: boolean }
  | { kind: 'tags'; labels: string[] }
  | { kind: 'text'; text: string };

export interface CompareRow {
  id: string;
  label: string;
  /** 数値の場合、どちらが「良い」とするか（ハイライト用）。none はハイライトしない */
  prefer?: 'min' | 'max' | 'none';
  cells: CompareCell[];
}

function numRow(id: string, label: string, views: MountainView[], get: (v: MountainView) => number | undefined, fmt: (n: number | undefined) => string, prefer: 'min' | 'max' | 'none' = 'none'): CompareRow {
  const values = views.map(get);
  const finite = values.filter(isFiniteNumber);
  const target = prefer === 'min' ? Math.min(...finite) : prefer === 'max' ? Math.max(...finite) : undefined;
  return {
    id,
    label,
    prefer,
    cells: values.map((value) => ({
      kind: 'number',
      value,
      text: fmt(value),
      best: prefer !== 'none' && finite.length > 1 && value === target,
    })),
  };
}

function ratingRow(id: string, label: string, views: MountainView[], key: keyof MountainView['ratings'], prefer: 'min' | 'max'): CompareRow {
  const row = numRow(id, label, views, (v) => v.ratings[key], (n) => (isFiniteNumber(n) ? `${Math.round(n * 10) / 10}` : '—'), prefer);
  return { ...row, cells: row.cells.map((c) => ({ ...c, kind: 'rating' }) as CompareCell) };
}

function tagsIn(v: MountainView, index: TagIndex, catKeys: string[], filterIds?: (id: ID) => boolean): string[] {
  const catIds = new Set(catKeys.map(categoryId));
  const labels: string[] = [];
  for (const cat of index.categories) {
    if (!catIds.has(cat.id)) continue;
    for (const t of index.tagsByCategory.get(cat.id) ?? []) {
      if (v.tagIds.has(t.id) && (!filterIds || filterIds(t.id))) labels.push(t.label);
    }
  }
  return labels;
}

export function buildCompareRows(views: MountainView[], index: TagIndex, pace?: number): CompareRow[] {
  const tagsRow = (id: string, label: string, keys: string[], filterIds?: (id: ID) => boolean): CompareRow => ({
    id,
    label,
    cells: views.map((v) => ({ kind: 'tags', labels: tagsIn(v, index, keys, filterIds) })),
  });
  const rows: CompareRow[] = [
    {
      id: 'status',
      label: '状況',
      cells: views.map((v) => ({
        kind: 'text',
        text: `${STATUS_LABEL[v.mountain.status]}${v.climbCount ? `（${v.climbCount}回）` : ''}`,
      })),
    },
    numRow('elevation', '標高', views, (v) => v.elevationM, (n) => formatMeters(n)),
    numRow('distance', '距離', views, (v) => v.distanceKm.value, (n) => formatKm(n), 'min'),
    numRow('ascent', '累積登り', views, (v) => v.ascentM.value, (n) => formatMeters(n), 'min'),
    numRow('descent', '累積下り', views, (v) => v.descentM.value, (n) => formatMeters(n), 'min'),
    numRow('courseTime', 'コースタイム', views, (v) => v.courseTimeMin.value, (n) => formatDuration(n), 'min'),
  ];
  if (isFiniteNumber(pace)) {
    rows.push(numRow('myTime', '自分の予想時間', views, (v) => estimateMyTime(v.courseTimeMin.value, pace), (n) => formatDuration(n), 'min'));
  }
  rows.push(
    ratingRow('stamina', '体力度', views, 'stamina', 'min'),
    ratingRow('technical', '技術度', views, 'technical', 'min'),
    ratingRow('fear', '怖さ', views, 'fear', 'min'),
    ratingRow('scenery', '景観', views, 'scenery', 'max'),
    ratingRow('fun', '楽しさ', views, 'fun', 'max'),
    numRow('access', 'アクセス(片道)', views, (v) => v.mountain.accessMinutes, (n) => formatDuration(n), 'min'),
    tagsRow('accessTags', 'アクセス手段', ACCESS_CATEGORY_KEYS),
    tagsRow('features', '主な特徴', FEATURE_CATEGORY_KEYS),
    tagsRow('danger', '危険・注意', DANGER_CATEGORY_KEYS),
    tagsRow('after', '下山後・施設', AFTER_CATEGORY_KEYS),
    tagsRow('season', '季節', ['season']),
    tagsRow('crowd', '混雑', ['crowd']),
  );
  return rows;
}
