/**
 * 「今日どこ行く？」提案エンジンのインターフェース。
 * 初期版はルールベース（ruleBased.ts）。将来 AI 提案を追加する場合は Suggester を実装して
 * registry に登録すれば、UI 側は変更なしで切り替えられる。
 */
import type { MountainView } from '../mountain';
import type { TagIndex } from '../tags';

export interface SuggestionRequest {
  moodIds: string[];
  /** 「再訪したい」の山も候補に含めるか */
  includeRevisit: boolean;
  /** 登頂済みの山も含めるか */
  includeClimbed: boolean;
  date: Date;
  nearbyMinutes: number;
  limit?: number;
}

export interface SuggestionContext {
  views: MountainView[];
  tagIndex: TagIndex;
  /** 自分のペース（CT比） */
  pace?: number;
}

export interface Suggestion {
  view: MountainView;
  score: number;
  /** 選んだ理由（UI にそのまま表示する） */
  reasons: string[];
  /** 注意点・データ不足など */
  warnings: string[];
  matchedMoodIds: string[];
  /** 部分的にしか合わなかった気分（例: 滝は無いが渓流はある） */
  partialMoodIds: string[];
  /** 選んだ気分のうち一致しなかったもの */
  missedMoodIds: string[];
}

export interface Suggester {
  id: string;
  name: string;
  suggest(req: SuggestionRequest, ctx: SuggestionContext): Promise<Suggestion[]>;
}

/** 気分ルールの評価結果。unknown はデータ不足で判定できない */
export interface MoodEvaluation {
  match: boolean | 'unknown';
  /** 近い要素はあるが完全には合わない */
  partial?: boolean;
  score: number;
  reasons: string[];
}

export interface MoodRule {
  id: string;
  label: string;
  emoji: string;
  /** true の場合は必須条件（一致しない山は候補から外す） */
  hard: boolean;
  evaluate(v: MountainView, ctx: SuggestionContext, req: SuggestionRequest): MoodEvaluation;
}
