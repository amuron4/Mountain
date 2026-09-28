/**
 * 自分が登った山を「ものさし」にした比較。
 * 例: 「蛭ヶ岳より距離が短い」「両神山より技術的に易しい」「飯縄山より累積標高が少ない」
 */
import { formatDuration, formatKm, formatMeters } from './format';
import type { MountainView } from './mountain';
import type { RatingKey } from './types';
import { isFiniteNumber } from './util';

export type BenchmarkMetric = 'distance' | 'ascent' | 'courseTime' | 'elevation' | 'stamina' | 'technical' | 'fear';

interface MetricDef {
  key: BenchmarkMetric;
  label: string;
  get: (v: MountainView) => number | undefined;
  format: (n: number) => string;
  /** 小さい側・大きい側の言い回し（「〇〇より」に続く） */
  lessWord: string;
  moreWord: string;
  /** 「同程度」とみなす差 */
  similar: (a: number, b: number) => boolean;
}

const ratio = (tol: number) => (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * tol;
const ratingOf = (k: RatingKey) => (v: MountainView) => v.ratings[k];
const fmtRating = (n: number) => `${Math.round(n * 10) / 10}`;

export const BENCHMARK_METRICS: MetricDef[] = [
  { key: 'distance', label: '距離', get: (v) => v.distanceKm.value, format: formatKm, lessWord: '距離が短い', moreWord: '距離が長い', similar: ratio(0.05) },
  { key: 'ascent', label: '累積標高', get: (v) => v.ascentM.value, format: formatMeters, lessWord: '累積標高が少ない', moreWord: '累積標高が多い', similar: ratio(0.05) },
  { key: 'courseTime', label: 'コースタイム', get: (v) => v.courseTimeMin.value, format: (n) => formatDuration(n), lessWord: 'コースタイムが短い', moreWord: 'コースタイムが長い', similar: ratio(0.05) },
  { key: 'elevation', label: '標高', get: (v) => v.elevationM, format: formatMeters, lessWord: '標高が低い', moreWord: '標高が高い', similar: (a, b) => Math.abs(a - b) <= 30 },
  { key: 'stamina', label: '体力度', get: ratingOf('stamina'), format: fmtRating, lessWord: '体力的に楽', moreWord: '体力的にきつい', similar: (a, b) => Math.abs(a - b) < 0.5 },
  { key: 'technical', label: '技術度', get: ratingOf('technical'), format: fmtRating, lessWord: '技術的に易しい', moreWord: '技術的に難しい', similar: (a, b) => Math.abs(a - b) < 0.5 },
  { key: 'fear', label: '怖さ', get: ratingOf('fear'), format: fmtRating, lessWord: '怖くない', moreWord: '怖い', similar: (a, b) => Math.abs(a - b) < 0.5 },
];

export interface BenchmarkRef {
  name: string;
  id: string;
  value: number;
}

export interface BenchmarkLine {
  metric: BenchmarkMetric;
  label: string;
  value: number;
  valueText: string;
  /** 自分の既登山の中で、これより大きい中で一番近い山（＝この山はそれより小さい） */
  lessThan?: BenchmarkRef;
  /** これより小さい中で一番近い山（＝この山はそれより大きい） */
  moreThan?: BenchmarkRef;
  similarTo?: BenchmarkRef;
  /** 既登山の中での位置（0 = 最小, 1 = 最大） */
  percentile?: number;
  sentences: string[];
  /** 既登山の最大値を超える＝自己最高を更新する */
  isNewRecord: boolean;
}

/**
 * target を、既に登った山（target 自身を除く）と比較する。
 * @param climbed 比較基準にする既登山のビュー
 */
export function benchmarkAgainst(target: MountainView, climbed: MountainView[], metrics = BENCHMARK_METRICS): BenchmarkLine[] {
  const pool = climbed.filter((c) => c.mountain.id !== target.mountain.id);
  const lines: BenchmarkLine[] = [];
  for (const def of metrics) {
    const value = def.get(target);
    if (!isFiniteNumber(value)) continue;
    const refs: BenchmarkRef[] = pool
      .map((c) => ({ name: c.mountain.name, id: c.mountain.id, value: def.get(c) }))
      .filter((r): r is BenchmarkRef => isFiniteNumber(r.value));
    if (refs.length === 0) continue;

    const similar = refs.filter((r) => def.similar(value, r.value)).sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))[0];
    const bigger = refs.filter((r) => r.value > value && !def.similar(value, r.value)).sort((a, b) => a.value - b.value)[0];
    const smaller = refs.filter((r) => r.value < value && !def.similar(value, r.value)).sort((a, b) => b.value - a.value)[0];
    const below = refs.filter((r) => r.value < value).length;
    const sentences: string[] = [];
    if (similar) sentences.push(`${similar.name}と同じくらい${def.label === '怖さ' ? '怖い' : `の${def.label}`}（${def.format(similar.value)}）`);
    if (bigger) sentences.push(`${bigger.name}より${def.lessWord}（${def.format(bigger.value)}）`);
    if (smaller) sentences.push(`${smaller.name}より${def.moreWord}（${def.format(smaller.value)}）`);
    const max = Math.max(...refs.map((r) => r.value));
    lines.push({
      metric: def.key,
      label: def.label,
      value,
      valueText: def.format(value),
      lessThan: bigger,
      moreThan: smaller,
      similarTo: similar,
      percentile: refs.length > 1 ? below / refs.length : undefined,
      sentences,
      isNewRecord: value > max && !def.similar(value, max),
    });
  }
  return lines;
}

/** 一行サマリ（リストや比較表で使う短い版） */
export function benchmarkHeadline(lines: BenchmarkLine[], max = 3): string[] {
  // 自己最高の更新を優先して表示し、残りを「〇〇より〜」で埋める
  const out = lines.filter((l) => l.isNewRecord).map((l) => `${l.label}は自己最高を更新（${l.valueText}）`);
  for (const l of lines) {
    if (out.length >= max) break;
    if (l.isNewRecord) continue;
    if (l.similarTo) out.push(l.sentences[0]);
    else if (l.lessThan) out.push(`${l.lessThan.name}より${BENCHMARK_METRICS.find((m) => m.key === l.metric)!.lessWord}`);
  }
  return out.slice(0, max);
}
