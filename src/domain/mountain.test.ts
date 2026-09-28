import { describe, expect, it } from 'vitest';
import { buildMountainView, createCourse, createMountain, estimateMyTime, personalPace, statusAfterRecord } from './mountain';
import { computePace, createRecord } from './record';

describe('buildMountainView', () => {
  it('prefers representative course stats, falls back to latest main record', () => {
    const m = createMountain({ name: 'A', courses: [createCourse({ distanceKm: 10 })] });
    const r1 = createRecord({ mountainIds: [m.id], date: '2024-01-01', distanceKm: 8, ascentM: 700, durationMin: 200, courseTimeMin: 240 });
    const r2 = createRecord({ mountainIds: [m.id], date: '2024-06-01', ascentM: 900 });
    const v = buildMountainView(m, [r1, r2]);
    expect(v.distanceKm).toEqual({ value: 10, source: 'course' });
    expect(v.ascentM).toEqual({ value: 900, source: 'record' });
    expect(v.courseTimeMin).toEqual({ value: 240, source: 'record' });
    expect(v.climbCount).toBe(2);
    expect(v.lastClimbed).toBe('2024-06-01');
    expect(v.firstClimbed).toBe('2024-01-01');
  });

  it('does not use traverse side-peak records for course numbers', () => {
    const main = createMountain({ name: 'Main' });
    const side = createMountain({ name: 'Side' });
    const r = createRecord({ mountainIds: [main.id, side.id], distanceKm: 20 });
    const v = buildMountainView(side, [r]);
    expect(v.distanceKm.value).toBeUndefined();
    expect(v.climbCount).toBe(1);
    expect(v.isClimbed).toBe(true);
  });

  it('merges explicit ratings with record averages and unions tags', () => {
    const m = createMountain({ ratings: { technical: 2 }, tagIds: ['a'] });
    const r1 = createRecord({ mountainIds: [m.id], ratings: { technical: 5, scenery: 4 }, tagIds: ['b'] });
    const r2 = createRecord({ mountainIds: [m.id], ratings: { scenery: 2 } });
    const v = buildMountainView(m, [r1, r2]);
    expect(v.ratings.technical).toBe(2);
    expect(v.ratings.scenery).toBe(3);
    expect([...v.tagIds].sort()).toEqual(['a', 'b']);
  });

  it('unclimbed without summit records is not climbed', () => {
    const m = createMountain();
    const r = createRecord({ mountainIds: [m.id], summitReached: false });
    expect(buildMountainView(m, [r]).isClimbed).toBe(false);
  });
});

describe('pace', () => {
  it('computes pace ratio and median personal pace', () => {
    expect(computePace({ durationMin: 360, courseTimeMin: 400 })).toBeCloseTo(0.9);
    expect(computePace({ durationMin: 360 })).toBeUndefined();
    const recs = [0.8, 0.9, 1.5].map((p) => createRecord({ durationMin: 100 * p, courseTimeMin: 100 }));
    expect(personalPace(recs)).toBeCloseTo(0.9);
    expect(personalPace([])).toBeUndefined();
    expect(estimateMyTime(400, 0.9)).toBe(360);
  });
});

describe('statusAfterRecord', () => {
  it('marks unclimbed as climbed only when summit reached', () => {
    const m = createMountain({ status: 'unclimbed' });
    expect(statusAfterRecord(m, createRecord({ summitReached: true }))).toBe('climbed');
    expect(statusAfterRecord(m, createRecord({ summitReached: false }))).toBe('unclimbed');
    expect(statusAfterRecord({ ...m, status: 'revisit' }, createRecord())).toBe('revisit');
  });
});
