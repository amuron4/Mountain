import { isFiniteNumber } from './util';

/** 分 → 「7時間20分」 */
export function formatDuration(min: number | undefined, fallback = '—'): string {
  if (!isFiniteNumber(min) || min < 0) return fallback;
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** 分 → 「7:20」 */
export function formatDurationShort(min: number | undefined, fallback = '—'): string {
  if (!isFiniteNumber(min) || min < 0) return fallback;
  const total = Math.round(min);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 時間文字列を分に変換する。
 * 「7:20」「7h20m」「7時間20分」「440」(分)「7.5h」に対応。
 */
export function parseDuration(input: string): number | undefined {
  const s = input.normalize('NFKC').trim().toLowerCase();
  if (!s) return undefined;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|時間)\s*(?:(\d+)\s*(?:m|min|分)?)?$/);
  if (m) return Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0);
  m = s.match(/^(\d+)\s*(?:m|min|分)$/);
  if (m) return Number(m[1]);
  if (/^\d+$/.test(s)) return Number(s);
  return undefined;
}

export function formatNumber(v: number | undefined, digits = 0, fallback = '—'): string {
  if (!isFiniteNumber(v)) return fallback;
  return v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatKm(v: number | undefined, fallback = '—'): string {
  if (!isFiniteNumber(v)) return fallback;
  return `${formatNumber(v, v >= 100 ? 0 : 1)}km`;
}

export function formatMeters(v: number | undefined, fallback = '—'): string {
  if (!isFiniteNumber(v)) return fallback;
  return `${formatNumber(v)}m`;
}

export function formatDate(d: string | undefined, fallback = '—'): string {
  if (!d) return fallback;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

export function formatPace(ratio: number | undefined, fallback = '—'): string {
  if (!isFiniteNumber(ratio)) return fallback;
  return `CT比 ${ratio.toFixed(2)}`;
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso);
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
