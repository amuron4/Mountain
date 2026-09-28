import { describe, expect, it } from 'vitest';
import { sampleContext } from '../test/fixtures';
import { applyFilter, countActiveConditions, emptyFilter, QUICK_NUMERIC_PRESETS, sortViews, type MountainFilter } from './filter';
import { T } from './presets';

const names = (vs: { mountain: { name: string } }[]) => vs.map((v) => v.mountain.name).sort();

describe('filter', () => {
  const { views, tagIndex } = sampleContext();
  const ctx = { tagsById: tagIndex.byId };
  const run = (patch: Partial<MountainFilter>) => applyFilter(views, { ...emptyFilter(), ...patch }, ctx);

  it('empty filter returns everything', () => {
    expect(run({})).toHaveLength(views.length);
  });

  it('spec example: 未踏 + 公共交通 + 尾根歩き + 累積1000m以上 + 温泉', () => {
    const r = run({
      statuses: ['unclimbed'],
      includeTagIds: [T.publicTransport, T.ridge, T.afterOnsen],
      ascentM: { min: 1000 },
    });
    // 谷川岳は累積800mなので除外、雲取山は温泉タグなしで除外
    expect(names(r)).toEqual([]);
    const r2 = run({ statuses: ['unclimbed'], includeTagIds: [T.publicTransport, T.ridge], ascentM: { min: 1000 } });
    expect(names(r2)).toEqual(['雲取山']);
  });

  it('numeric ranges exclude missing values and use hours for course time', () => {
    expect(names(run({ elevationM: { min: 2000 } }))).toEqual(['燕岳', '瑞牆山', '甲武信ヶ岳', '赤岳', '雲取山'].sort());
    expect(names(run({ distanceKm: { min: 10, max: 14 } }))).toEqual(['両神山', '伊豆ヶ岳', '川苔山', '燕岳'].sort());
    expect(names(run({ courseTimeH: { max: 3 } }))).toEqual(['金時山']);
  });

  it('tag any/all modes and exclusion', () => {
    const any = run({ includeTagIds: [T.waterfall, T.chain], tagMode: 'any' });
    const all = run({ includeTagIds: [T.waterfall, T.chain], tagMode: 'all' });
    expect(any.length).toBeGreaterThan(all.length);
    expect(names(all)).toEqual(['棒ノ折山']);
    const noBear = run({ excludeTagIds: ['danger.bear'] });
    expect(noBear.every((v) => !v.tagIds.has('danger.bear'))).toBe(true);
  });

  it('record tags are searchable through the mountain', () => {
    // 蛭ヶ岳の山行記録にだけ「夕日」タグがある
    expect(names(run({ includeTagIds: ['scenery.sunset'] }))).toEqual(['蛭ヶ岳']);
  });

  it('text search covers name, kana, tag labels and aliases (AND terms)', () => {
    expect(names(run({ text: 'ヒルガタケ' }))).toEqual(['蛭ヶ岳']);
    expect(names(run({ text: '日帰り湯 奥多摩' }))).toEqual(['御岳山', '川苔山'].sort());
    expect(names(run({ text: '百尋ノ滝' }))).toEqual(['川苔山']);
  });

  it('favorite, wish, region, prefecture, ratings', () => {
    expect(names(run({ favoriteOnly: true }))).toEqual(['蛭ヶ岳', '高尾山'].sort());
    expect(names(run({ minWish: 3 }))).toEqual(['赤岳', '雲取山'].sort());
    expect(run({ regions: ['甲信越'] }).every((v) => v.mountain.region === '甲信越')).toBe(true);
    expect(names(run({ prefectures: ['群馬県'] }))).toEqual(['谷川岳']);
    expect(names(run({ minRatings: { scenery: 5 } }))).toEqual(['蛭ヶ岳', '金時山', '飯縄山'].sort());
    expect(run({ maxRatings: { fear: 1 } }).every((v) => (v.ratings.fear ?? 99) <= 1)).toBe(true);
  });

  it('quick presets toggle ranges and are counted', () => {
    const p = QUICK_NUMERIC_PRESETS.find((q) => q.id === 'asc1000')!;
    const f = p.apply(emptyFilter());
    expect(p.isActive(f)).toBe(true);
    expect(countActiveConditions(f)).toBe(1);
    expect(countActiveConditions({ ...f, includeTagIds: ['a', 'b'], favoriteOnly: true })).toBe(4);
  });
});

describe('sort', () => {
  const { views } = sampleContext();
  it('sorts by elevation desc and asc', () => {
    expect(sortViews(views, { key: 'elevation', dir: 'desc' })[0].mountain.name).toBe('赤岳');
    expect(sortViews(views, { key: 'elevation', dir: 'asc' })[0].mountain.name).toBe('高尾山');
  });
  it('puts missing values last in both directions', () => {
    const asc = sortViews(views, { key: 'lastClimbed', dir: 'asc' });
    const desc = sortViews(views, { key: 'lastClimbed', dir: 'desc' });
    expect(asc[asc.length - 1].lastClimbed).toBeUndefined();
    expect(desc[0].mountain.name).toBe('高尾山');
    expect(desc[desc.length - 1].lastClimbed).toBeUndefined();
  });
  it('sorts by rating and name', () => {
    expect(sortViews(views, { key: 'rating:revisit', dir: 'desc' })[0].mountain.name).toBe('蛭ヶ岳');
    expect(sortViews(views, { key: 'name', dir: 'asc' })[0].mountain.name).toBe('赤岳');
    expect(sortViews(views, { key: 'distance', dir: 'desc' })[0].mountain.name).toBe('蛭ヶ岳');
  });
});
