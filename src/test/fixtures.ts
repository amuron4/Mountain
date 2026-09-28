import { buildSampleData } from '../data/sample';
import { DEFAULT_SETTINGS } from '../data/exportImport';
import { buildMountainViews } from '../domain/mountain';
import { buildPresetEntities, buildTagIndex } from '../domain/tags';
import type { Dataset } from '../domain/types';

export function sampleDataset(): Dataset {
  const { categories, tags } = buildPresetEntities('2024-01-01T00:00:00.000Z');
  const { mountains, records } = buildSampleData();
  return { mountains, records, tagCategories: categories, tags, settings: { ...DEFAULT_SETTINGS } };
}

export function sampleContext() {
  const data = sampleDataset();
  const views = buildMountainViews(data.mountains, data.records);
  const tagIndex = buildTagIndex(data.tagCategories, data.tags);
  const byName = (name: string) => {
    const v = views.find((x) => x.mountain.name === name);
    if (!v) throw new Error(`no sample mountain ${name}`);
    return v;
  };
  return { data, views, tagIndex, byName };
}
