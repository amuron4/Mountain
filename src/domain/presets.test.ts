import { describe, expect, it } from 'vitest';
import { PRESET_CATEGORIES, T } from './presets';
import { buildPresetEntities } from './tags';

describe('presets', () => {
  const { categories, tags } = buildPresetEntities();
  it('has unique ids', () => {
    expect(new Set(tags.map((t) => t.id)).size).toBe(tags.length);
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
  });
  it('covers many independent categories with rich tags', () => {
    expect(PRESET_CATEGORIES.length).toBeGreaterThanOrEqual(15);
    expect(tags.length).toBeGreaterThan(150);
  });
  it('all tag constants referenced by rules exist', () => {
    const ids = new Set(tags.map((t) => t.id));
    for (const id of Object.values(T)) expect(ids.has(id), id).toBe(true);
  });
  it('every tag belongs to an existing category', () => {
    const catIds = new Set(categories.map((c) => c.id));
    for (const t of tags) expect(catIds.has(t.categoryId)).toBe(true);
  });
});
