/**
 * ルールベースの提案エンジン。
 * 1. 候補を絞る（未踏 / 再訪したい）
 * 2. 必須の気分（公共交通・短時間・近場・ゆるく）で除外
 * 3. その他の気分・季節・行きたい度でスコアリングし、理由を添えて返す
 */
import { estimateMyTime } from '../mountain';
import { formatDuration } from '../format';
import { categoryId } from '../presets';
import { isFiniteNumber } from '../util';
import { MOOD_RULES } from './moods';
import { SEASON_LABEL, seasonOf, seasonTagIds } from './season';
import type { Suggester, Suggestion, SuggestionContext, SuggestionRequest } from './types';

export function suggestByRules(req: SuggestionRequest, ctx: SuggestionContext): Suggestion[] {
  const moods = MOOD_RULES.filter((m) => req.moodIds.includes(m.id));
  const softMoods = moods.filter((m) => !m.hard);
  const hardMoods = moods.filter((m) => m.hard);
  const seasonIds = seasonTagIds(req.date);
  const season = SEASON_LABEL[seasonOf(req.date)];
  const dangerCat = categoryId('danger');

  const candidates = ctx.views.filter((v) => {
    const s = v.mountain.status;
    if (s === 'unclimbed') return true;
    if (s === 'revisit') return req.includeRevisit;
    return req.includeClimbed;
  });

  const results: Suggestion[] = [];
  for (const v of candidates) {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const matched: string[] = [];
    const partial: string[] = [];
    const missed: string[] = [];
    let score = 0;
    let excluded = false;

    for (const mood of hardMoods) {
      const ev = mood.evaluate(v, ctx, req);
      if (ev.match === false) {
        excluded = true;
        break;
      }
      if (ev.match === 'unknown') {
        warnings.push(`${mood.label}: ${ev.reasons.join('、') || '判定できるデータがありません'}`);
        missed.push(mood.id);
        score -= 1;
      } else {
        matched.push(mood.id);
        score += ev.score;
        reasons.push(`${mood.emoji} ${mood.label}: ${ev.reasons.join('、')}`);
      }
    }
    if (excluded) continue;

    let softMatched = 0;
    for (const mood of softMoods) {
      const ev = mood.evaluate(v, ctx, req);
      if (ev.match === true) {
        softMatched++;
        (ev.partial ? partial : matched).push(mood.id);
        score += ev.score;
        reasons.push(`${mood.emoji} ${mood.label}: ${ev.reasons.join('、')}`);
      } else {
        missed.push(mood.id);
        if (ev.reasons.length) warnings.push(ev.reasons.join('、'));
      }
    }
    if (softMoods.length > 0 && softMatched === 0) continue;

    // 季節
    const seasonHits = seasonIds.filter((id) => v.tagIds.has(id)).map((id) => ctx.tagIndex.byId.get(id)?.label ?? id);
    if (seasonHits.length) {
      score += 1;
      reasons.push(`🍂 今の季節（${season}）向き: ${seasonHits.join('・')}`);
    }
    // 行きたい度・お気に入り
    if (v.mountain.wish > 0) {
      score += v.mountain.wish * 0.7;
      reasons.push(`⭐ 行きたい度 ${'★'.repeat(v.mountain.wish)}`);
    }
    if (v.mountain.status === 'revisit' && isFiniteNumber(v.ratings.revisit)) {
      score += v.ratings.revisit / 2;
      reasons.push(`🔁 また行きたい度 ${Math.round(v.ratings.revisit)}`);
    }
    // 自分のペースでの予想時間
    const my = estimateMyTime(v.courseTimeMin.value, ctx.pace);
    if (isFiniteNumber(my)) reasons.push(`🕒 自分のペースなら約${formatDuration(my)}`);
    // 危険要素は注意として表示
    const dangers = [...v.tagIds]
      .map((id) => ctx.tagIndex.byId.get(id))
      .filter((t) => t && t.categoryId === dangerCat && !t.hidden)
      .map((t) => t!.label);
    if (dangers.length) warnings.push(`注意: ${dangers.join('・')}`);

    if (moods.length === 0 && score <= 0) {
      // 条件なしの「おまかせ」では、最低限の理由がある山のみ
      if (!reasons.length) reasons.push('未踏の候補');
    }

    results.push({ view: v, score, reasons, warnings, matchedMoodIds: matched, partialMoodIds: partial, missedMoodIds: missed });
  }

  results.sort(
    (a, b) =>
      b.matchedMoodIds.length - a.matchedMoodIds.length ||
      b.partialMoodIds.length - a.partialMoodIds.length ||
      b.score - a.score ||
      a.view.mountain.name.localeCompare(b.view.mountain.name, 'ja'),
  );
  return results.slice(0, req.limit ?? 10);
}

export const ruleBasedSuggester: Suggester = {
  id: 'rules',
  name: 'ルールベース',
  async suggest(req, ctx) {
    return suggestByRules(req, ctx);
  },
};
