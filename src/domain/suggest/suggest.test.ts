import { describe, expect, it } from 'vitest';
import { sampleContext } from '../../test/fixtures';
import { getSuggester, suggestByRules, type SuggestionRequest } from './index';
import { seasonOf } from './season';

const base: SuggestionRequest = {
  moodIds: [],
  includeRevisit: true,
  includeClimbed: false,
  date: new Date('2026-10-10T09:00:00'),
  nearbyMinutes: 120,
};

describe('rule-based suggestions', () => {
  const { views, tagIndex } = sampleContext();
  const ctx = { views, tagIndex, pace: 0.9 };
  const run = (patch: Partial<SuggestionRequest>) => suggestByRules({ ...base, ...patch }, ctx);
  const names = (r: ReturnType<typeof run>) => r.map((s) => s.view.mountain.name);

  it('only proposes unclimbed (and revisit) mountains', () => {
    const r = run({});
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.view.mountain.status !== 'climbed')).toBe(true);
    expect(names(run({ includeRevisit: false }))).not.toContain('金時山');
  });

  it('waterfall mood ranks mountains with 滝 first and explains why', () => {
    const r = run({ moodIds: ['waterfall'] });
    expect(names(r).slice(0, 3).sort()).toEqual(['川苔山', '御岳山', '棒ノ折山'].sort());
    expect(r[0].reasons.some((x) => x.includes('滝'))).toBe(true);
  });

  it('hard moods exclude mismatches (public transport + short)', () => {
    const r = run({ moodIds: ['public', 'short'] });
    // 金時山(CT2:40)・御岳山(CT3:30)。雲取山などCTが長い山や車向きの山は除外
    expect(names(r).sort()).toEqual(['御岳山', '金時山'].sort());
    expect(names(r)).not.toContain('瑞牆山');
    expect(r[0].reasons.join()).toContain('公共交通');
  });

  it('nearby uses access minutes and setting', () => {
    const r = run({ moodIds: ['nearby'], nearbyMinutes: 100 });
    expect(names(r).sort()).toEqual(['御岳山', '棒ノ折山'].sort());
  });

  it('combined soft moods prefer mountains matching more of them', () => {
    const r = run({ moodIds: ['rock', 'view'] });
    expect(r[0].view.mountain.name).toBe('赤岳');
    expect(r[0].matchedMoodIds.sort()).toEqual(['rock', 'view']);
  });

  it('gentle excludes long courses; quiet excludes crowded', () => {
    expect(names(run({ moodIds: ['gentle'] }))).not.toContain('雲取山');
    const quiet = run({ moodIds: ['quiet'] });
    expect(names(quiet)).toEqual(['甲武信ヶ岳']);
  });

  it('adds season reasons, my pace estimate and danger warnings', () => {
    expect(seasonOf(base.date)).toBe('autumn');
    const r = run({ moodIds: ['hard'] });
    const kumo = r.find((s) => s.view.mountain.name === '雲取山')!;
    expect(kumo.reasons.join()).toContain('今の季節（秋）');
    expect(kumo.reasons.join()).toContain('自分のペースなら');
    expect(kumo.warnings.join()).toContain('クマ');
  });

  it('exposes a pluggable async suggester', async () => {
    const r = await getSuggester('rules').suggest({ ...base, moodIds: ['onsen'] }, ctx);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.reasons.join().includes('温泉'))).toBe(true);
  });
});
