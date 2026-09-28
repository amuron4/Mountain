import { describe, expect, it } from 'vitest';
import { sampleContext } from '../test/fixtures';
import { benchmarkAgainst, benchmarkHeadline } from './benchmark';
import { buildCompareRows } from './compare';

describe('benchmarkAgainst climbed mountains', () => {
  const { views, byName, tagIndex } = sampleContext();
  const climbed = views.filter((v) => v.isClimbed);

  it('produces sentences relative to my climbed mountains', () => {
    const lines = benchmarkAgainst(byName('川苔山'), climbed);
    const dist = lines.find((l) => l.metric === 'distance')!;
    // 13.0km: 伊豆ヶ岳(13.0km)と同程度、蛭ヶ岳(23km)より短い、両神山(11km)より長い
    expect(dist.similarTo?.name).toBe('伊豆ヶ岳');
    expect(dist.lessThan?.name).toBe('蛭ヶ岳');
    expect(dist.moreThan?.name).toBe('両神山');
    expect(dist.sentences.join()).toContain('蛭ヶ岳より距離が短い');

    const tech = lines.find((l) => l.metric === 'technical')!;
    expect(tech.lessThan?.name).toBe('両神山');
    expect(tech.sentences.join()).toContain('両神山より技術的に易しい');

    const asc = lines.find((l) => l.metric === 'ascent')!;
    expect(asc.sentences.join()).toContain('より累積標高が少ない');
  });

  it('detects new personal records', () => {
    const lines = benchmarkAgainst(byName('赤岳'), climbed);
    expect(lines.find((l) => l.metric === 'elevation')!.isNewRecord).toBe(true);
    expect(benchmarkHeadline(lines).join()).toContain('自己最高');
  });

  it('excludes the target itself and handles empty pools', () => {
    const lines = benchmarkAgainst(byName('蛭ヶ岳'), climbed);
    expect(lines.every((l) => l.lessThan?.name !== '蛭ヶ岳' && l.moreThan?.name !== '蛭ヶ岳')).toBe(true);
    expect(benchmarkAgainst(byName('蛭ヶ岳'), [])).toEqual([]);
  });

  it('builds compare rows with best highlights', () => {
    const rows = buildCompareRows([byName('雲取山'), byName('瑞牆山'), byName('赤岳')], tagIndex, 0.9);
    const dist = rows.find((r) => r.id === 'distance')!;
    expect(dist.cells.map((c) => (c.kind === 'number' ? c.best : null))).toEqual([false, true, false]);
    expect(rows.find((r) => r.id === 'myTime')).toBeTruthy();
    const danger = rows.find((r) => r.id === 'danger')!;
    expect(danger.cells[2].kind === 'tags' && danger.cells[2].labels).toContain('鎖場');
    const after = rows.find((r) => r.id === 'after')!;
    expect(after.cells[0].kind === 'tags' && after.cells[0].labels).toContain('山小屋');
  });
});
