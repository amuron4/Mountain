import { describe, expect, it } from 'vitest';
import { formatDuration, formatDurationShort, formatKm, formatMeters, parseDuration } from './format';
import { normalizeText } from './util';

describe('duration', () => {
  it('formats minutes', () => {
    expect(formatDuration(440)).toBe('7時間20分');
    expect(formatDuration(45)).toBe('45分');
    expect(formatDuration(120)).toBe('2時間');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDurationShort(440)).toBe('7:20');
  });
  it('parses many notations', () => {
    expect(parseDuration('7:20')).toBe(440);
    expect(parseDuration('7h20m')).toBe(440);
    expect(parseDuration('7時間20分')).toBe(440);
    expect(parseDuration('７：２０')).toBe(440);
    expect(parseDuration('7.5h')).toBe(450);
    expect(parseDuration('90分')).toBe(90);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('abc')).toBeUndefined();
    expect(parseDuration('')).toBeUndefined();
  });
});

describe('number format', () => {
  it('formats distance and meters', () => {
    expect(formatKm(14.2)).toBe('14.2km');
    expect(formatMeters(1270)).toBe('1,270m');
  });
});

describe('normalizeText', () => {
  it('unifies kana, width and ヶ', () => {
    expect(normalizeText('ヒルガタケ')).toBe(normalizeText('ひるがたけ'));
    expect(normalizeText('蛭ヶ岳')).toBe(normalizeText('蛭ケ岳'));
    expect(normalizeText('ＡＢＣ ｄ')).toBe('abcd');
  });
});
