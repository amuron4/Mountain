import { describe, expect, it } from 'vitest';
import { createMountain } from './mountain';
import { createRecord } from './record';
import { buildPresetEntities, buildTagIndex, createCustomTag, findDuplicateTag, groupTagIds, missingPresets, planTagRemoval, tagMatchesQuery } from './tags';

describe('tags', () => {
  const { categories, tags } = buildPresetEntities();

  it('missingPresets adds only what is absent and keeps user edits', () => {
    const edited = tags.map((t) => (t.id === 'terrain.ridge' ? { ...t, label: '尾根道' } : t));
    const withoutOne = edited.filter((t) => t.id !== 'scenery.fuji');
    const missing = missingPresets(categories, withoutOne);
    expect(missing.categories).toHaveLength(0);
    expect(missing.tags.map((t) => t.id)).toEqual(['scenery.fuji']);
  });

  it('hidden builtin tags are not re-added', () => {
    const hidden = tags.map((t) => (t.id === 'scenery.fuji' ? { ...t, hidden: true } : t));
    expect(missingPresets(categories, hidden).tags).toHaveLength(0);
  });

  it('custom tags can be created and duplicates detected', () => {
    const t = createCustomTag('cat.preference', ' 猫がいる ', tags);
    expect(t.label).toBe('猫がいる');
    expect(t.builtin).toBe(false);
    expect(findDuplicateTag('cat.terrain', '尾根', tags)?.id).toBe('terrain.ridge');
    expect(findDuplicateTag('cat.scenery', '尾根', tags)).toBeUndefined();
  });

  it('planTagRemoval strips references; builtin hidden, custom deleted', () => {
    const m = createMountain({ tagIds: ['terrain.ridge', 'x'] });
    const r = createRecord({ tagIds: ['terrain.ridge'] });
    const builtin = tags.find((t) => t.id === 'terrain.ridge')!;
    const plan = planTagRemoval(builtin, [m], [r]);
    expect(plan.hideTag?.hidden).toBe(true);
    expect(plan.deleteTagId).toBeUndefined();
    expect(plan.mountains[0].tagIds).toEqual(['x']);
    expect(plan.records[0].tagIds).toEqual([]);
    const custom = createCustomTag('cat.terrain', 'けもの道', tags);
    expect(planTagRemoval(custom, [], []).deleteTagId).toBe(custom.id);
  });

  it('groups tag ids by category in display order and matches aliases', () => {
    const index = buildTagIndex(categories, tags);
    const groups = groupTagIds(['after.onsen', 'terrain.ridge', 'unknown'], index);
    expect(groups.map((g) => g.category.id)).toEqual(['cat.terrain', 'cat.after']);
    expect(tagMatchesQuery(index.byId.get('after.onsen')!, '日帰り湯')).toBe(true);
    expect(tagMatchesQuery(index.byId.get('technical.chain')!, 'くさり')).toBe(true);
  });
});
