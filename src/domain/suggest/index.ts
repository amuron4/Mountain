import { ruleBasedSuggester } from './ruleBased';
import type { Suggester } from './types';

export * from './types';
export { MOOD_RULES, moodById } from './moods';
export { suggestByRules } from './ruleBased';
export { seasonOf, SEASON_LABEL } from './season';

/**
 * 利用可能な提案エンジン。将来 AI 提案（例: aiSuggester）を追加する場合はここに登録する。
 * AI 版は SuggestionContext から山データを要約してプロンプト化し、同じ Suggestion 型で返せばよい。
 */
export const SUGGESTERS: Suggester[] = [ruleBasedSuggester];

export function getSuggester(id = 'rules'): Suggester {
  return SUGGESTERS.find((s) => s.id === id) ?? ruleBasedSuggester;
}
