import { describe, expect, it } from 'vitest';
import { sampleDataset } from '../test/fixtures';
import { ImportError, mergeDatasets, parseExport, repairReferences, serializeDataset } from './exportImport';

describe('export / import', () => {
  it('round-trips the whole dataset', () => {
    const data = sampleDataset();
    const parsed = parseExport(serializeDataset(data));
    expect(parsed.data.mountains).toEqual(data.mountains);
    expect(parsed.data.records).toEqual(data.records);
    expect(parsed.data.tags).toHaveLength(data.tags.length);
    expect(parsed.data.tagCategories).toHaveLength(data.tagCategories.length);
    expect(parsed.skipped).toEqual({ mountains: 0, records: 0, tags: 0, tagCategories: 0 });
  });

  it('rejects non-JSON, foreign files and future formats', () => {
    expect(() => parseExport('not json')).toThrow(ImportError);
    expect(() => parseExport('{"foo":1}')).toThrow(/バックアップファイルではない/);
    expect(() => parseExport(JSON.stringify({ app: 'yama-note', format: 99, data: {} }))).toThrow(/新しいバージョン/);
  });

  it('sanitizes broken entities instead of failing', () => {
    const text = JSON.stringify({
      app: 'yama-note',
      format: 1,
      data: {
        mountains: [
          { id: 'm1', name: '  テスト山 ', elevationM: '1234', status: 'weird', wish: 9, ratings: { fun: 7, scenery: 4 } },
          { id: 'bad' },
        ],
        records: [
          { id: 'r1', mountainIds: ['m1'], date: '2024-05-05', distanceKm: 'x' },
          { id: 'r2', mountainIds: [], date: '2024-05-05' },
          { id: 'r3', mountainIds: ['m1'], date: 'yesterday' },
        ],
        tags: [{ id: 't', label: 'x' }],
      },
    });
    const { data, skipped } = parseExport(text);
    expect(data.mountains).toHaveLength(1);
    const m = data.mountains[0];
    expect(m.name).toBe('テスト山');
    expect(m.elevationM).toBe(1234);
    expect(m.status).toBe('unclimbed');
    expect(m.wish).toBe(3);
    expect(m.ratings).toEqual({ scenery: 4 });
    expect(m.tagIds).toEqual([]);
    expect(data.records.map((r) => r.id)).toEqual(['r1']);
    expect(data.records[0].distanceKm).toBeUndefined();
    expect(skipped).toEqual({ mountains: 1, records: 2, tags: 1, tagCategories: 0 });
    expect(data.settings.theme).toBe('auto');
  });

  it('merge keeps newer updatedAt and adds new entities', () => {
    const cur = sampleDataset();
    const incoming = structuredClone(cur);
    incoming.mountains[0] = { ...incoming.mountains[0], name: '新しい名前', updatedAt: '2999-01-01T00:00:00.000Z' };
    incoming.mountains[1] = { ...incoming.mountains[1], name: '古い名前', updatedAt: '2000-01-01T00:00:00.000Z' };
    incoming.mountains.push({ ...incoming.mountains[2], id: 'brand-new', name: '追加山' });
    const { data, report } = mergeDatasets(cur, incoming);
    expect(data.mountains.find((m) => m.id === cur.mountains[0].id)!.name).toBe('新しい名前');
    expect(data.mountains.find((m) => m.id === cur.mountains[1].id)!.name).toBe(cur.mountains[1].name);
    expect(report.mountains).toEqual({ added: 1, updated: 1 });
  });

  it('repairReferences removes dangling mountain refs and orphan tags', () => {
    const d = sampleDataset();
    d.records[0] = { ...d.records[0], mountainIds: ['ghost'] };
    d.tags.push({ ...d.tags[0], id: 'orphan', categoryId: 'nope' });
    const fixed = repairReferences(d);
    expect(fixed.records).toHaveLength(d.records.length - 1);
    expect(fixed.tags.find((t) => t.id === 'orphan')).toBeUndefined();
  });
});
