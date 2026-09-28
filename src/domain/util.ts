import type { DateString, Timestamp } from './types';

export function newId(prefix = ''): string {
  const c = globalThis.crypto;
  const raw =
    c && 'randomUUID' in c
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowIso(): Timestamp {
  return new Date().toISOString();
}

export function todayString(d = new Date()): DateString {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 検索用の正規化: 全角半角統一・小文字化・カタカナ→ひらがな・空白除去 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    // 「蛭ヶ岳」「蛭ケ岳」を同一視するため、小書きのヶ/ヵ を先に通常の仮名へ
    .replace(/[ヶヵ]/g, (ch) => (ch === 'ヶ' ? 'け' : 'か'))
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
