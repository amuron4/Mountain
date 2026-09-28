/**
 * 「今日の気分」ルール定義。
 * ルールはタグID（プリセットの安定ID）と数値・評価を組み合わせて判定する。
 * 新しい気分を増やすときはこの配列に追加するだけでよい。
 */
import { formatDuration, formatKm, formatMeters } from '../format';
import type { MountainView } from '../mountain';
import { T } from '../presets';
import type { ID } from '../types';
import { isFiniteNumber } from '../util';
import type { MoodEvaluation, MoodRule, SuggestionContext } from './types';

function tagHits(v: MountainView, ctx: SuggestionContext, ids: readonly ID[]): string[] {
  return ids.filter((id) => v.tagIds.has(id)).map((id) => ctx.tagIndex.byId.get(id)?.label ?? id);
}

function tagReason(labels: string[]): string[] {
  return labels.length ? [`「${labels.slice(0, 4).join('」「')}」`] : [];
}

const no = (reasons: string[] = []): MoodEvaluation => ({ match: false, score: 0, reasons });
const unknown = (reasons: string[] = []): MoodEvaluation => ({ match: 'unknown', score: 0, reasons });

export const MOOD_RULES: MoodRule[] = [
  {
    id: 'hard',
    label: 'がっつり歩きたい',
    emoji: '💪',
    hard: false,
    evaluate(v, ctx) {
      const reasons: string[] = [];
      let score = 0;
      const asc = v.ascentM.value;
      const ct = v.courseTimeMin.value;
      const dist = v.distanceKm.value;
      if (isFiniteNumber(asc) && asc >= 1000) (score += 2), reasons.push(`累積標高${formatMeters(asc)}`);
      if (isFiniteNumber(ct) && ct >= 360) (score += 2), reasons.push(`コースタイム${formatDuration(ct)}`);
      if (isFiniteNumber(dist) && dist >= 12) (score += 1), reasons.push(`距離${formatKm(dist)}`);
      const tags = tagHits(v, ctx, [T.staminaSolid, T.staminaLong, T.staminaVerylong, T.staminaBigascent, T.prefHearty]);
      if (tags.length) (score += tags.length), reasons.push(...tagReason(tags));
      if ((v.ratings.stamina ?? 0) >= 4) (score += 1), reasons.push(`体力度${Math.round(v.ratings.stamina!)}`);
      return score > 0 ? { match: true, score, reasons } : no();
    },
  },
  {
    id: 'gentle',
    label: 'ゆるく歩きたい',
    emoji: '🌿',
    hard: true,
    evaluate(v, ctx) {
      const ct = v.courseTimeMin.value;
      const asc = v.ascentM.value;
      const heavyTags = tagHits(v, ctx, [T.staminaLong, T.staminaVerylong, T.staminaBigascent, T.staminaSolid]);
      if (heavyTags.length) return no();
      if ((v.ratings.stamina ?? 0) >= 4) return no();
      if (isFiniteNumber(ct) && ct > 270) return no();
      if (isFiniteNumber(asc) && asc > 800) return no();
      const reasons: string[] = [];
      let score = 0;
      if (isFiniteNumber(ct)) (score += 1), reasons.push(`コースタイム${formatDuration(ct)}`);
      if (isFiniteNumber(asc)) (score += 1), reasons.push(`累積標高${formatMeters(asc)}`);
      const light = tagHits(v, ctx, [T.staminaLight, T.diffHiking]);
      if (light.length) (score += 2), reasons.push(...tagReason(light));
      if (isFiniteNumber(v.ratings.stamina) && v.ratings.stamina <= 2) (score += 1), reasons.push('体力度が低め');
      return score > 0 ? { match: true, score, reasons } : unknown(['コース数値が未登録']);
    },
  },
  {
    id: 'view',
    label: '景色重視',
    emoji: '🌄',
    hard: false,
    evaluate(v, ctx) {
      const tags = tagHits(v, ctx, [T.fuji, T.alps, T.panorama, T.mountains, T.sea, T.cloudsea, T.lake, T.prefView]);
      let score = tags.length;
      const reasons = tagReason(tags);
      if ((v.ratings.scenery ?? 0) >= 4) (score += 2), reasons.push(`景色評価${Math.round(v.ratings.scenery!)}`);
      return score > 0 ? { match: true, score, reasons } : no();
    },
  },
  {
    id: 'ridge',
    label: '尾根歩きしたい',
    emoji: '〰️',
    hard: false,
    evaluate(v, ctx) {
      const tags = tagHits(v, ctx, [T.ridge, T.skyline, T.styleTraverse, T.prefRidgewalk, T.knife]);
      return tags.length ? { match: true, score: tags.length * 1.5, reasons: tagReason(tags) } : no();
    },
  },
  {
    id: 'rock',
    label: '岩場に行きたい',
    emoji: '🧗',
    hard: false,
    evaluate(v, ctx) {
      const tags = tagHits(v, ctx, [T.rocky, T.rockridge, T.chain, T.ladder, T.scramble, T.threepoint, T.diffRocky, 'feature.rockpeak']);
      let score = tags.length * 1.5;
      const reasons = tagReason(tags);
      if ((v.ratings.technical ?? 0) >= 3) (score += 1), reasons.push(`技術度${Math.round(v.ratings.technical!)}`);
      return tags.length ? { match: true, score, reasons } : no();
    },
  },
  {
    id: 'waterfall',
    label: '滝を見たい',
    emoji: '💧',
    hard: false,
    evaluate(v, ctx) {
      const strong = tagHits(v, ctx, [T.waterfall]);
      const weak = tagHits(v, ctx, [T.brook, T.stream, T.gorge]);
      const score = strong.length * 3 + weak.length;
      if (strong.length) return { match: true, score, reasons: tagReason([...strong, ...weak]) };
      if (weak.length) return { match: true, partial: true, score, reasons: [...tagReason(weak), '（滝の登録はなし）'] };
      return no();
    },
  },
  {
    id: 'onsen',
    label: '温泉に入りたい',
    emoji: '♨️',
    hard: false,
    evaluate(v, ctx) {
      const tags = tagHits(v, ctx, [T.afterOnsen, T.facilityOnsen]);
      return tags.length ? { match: true, score: 3, reasons: ['下山後に温泉あり'] } : no();
    },
  },
  {
    id: 'short',
    label: '短時間',
    emoji: '⏱️',
    hard: true,
    evaluate(v, ctx) {
      const ct = v.courseTimeMin.value ?? v.actualTimeMin;
      if (isFiniteNumber(ct)) {
        return ct <= 210 ? { match: true, score: 2 + (210 - ct) / 60, reasons: [`コースタイム${formatDuration(ct)}`] } : no();
      }
      const light = tagHits(v, ctx, [T.staminaLight]);
      if (light.length) return { match: true, score: 1, reasons: tagReason(light) };
      return unknown(['コースタイム未登録']);
    },
  },
  {
    id: 'quiet',
    label: '静かな山',
    emoji: '🤫',
    hard: false,
    evaluate(v, ctx) {
      const crowded = tagHits(v, ctx, [T.crowdPopular, T.crowdCrowded]);
      const quiet = tagHits(v, ctx, [T.crowdQuiet, T.crowdFew, T.prefQuiet]);
      if (quiet.length && !crowded.length) return { match: true, score: quiet.length * 2, reasons: tagReason(quiet) };
      if (crowded.length) return no([`混雑傾向: ${crowded.join('・')}`]);
      return no();
    },
  },
  {
    id: 'public',
    label: '公共交通だけ',
    emoji: '🚃',
    hard: true,
    evaluate(v, ctx) {
      const ok = tagHits(v, ctx, [T.publicTransport, T.walkFromStation, T.bus, T.station2station, T.bus2station]);
      if (ok.length) return { match: true, score: 1, reasons: tagReason(ok) };
      const car = tagHits(v, ctx, [T.car]);
      if (car.length) return no();
      return unknown(['アクセス手段が未登録']);
    },
  },
  {
    id: 'nearby',
    label: '近場',
    emoji: '📍',
    hard: true,
    evaluate(v, _ctx, req) {
      const a = v.mountain.accessMinutes;
      if (!isFiniteNumber(a)) return unknown(['アクセス時間が未登録']);
      return a <= req.nearbyMinutes ? { match: true, score: 1 + (req.nearbyMinutes - a) / 60, reasons: [`片道${formatDuration(a)}`] } : no();
    },
  },
];

export function moodById(id: string): MoodRule | undefined {
  return MOOD_RULES.find((m) => m.id === id);
}
