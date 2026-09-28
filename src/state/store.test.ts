import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IdbRepository } from '../data/idbRepository';
import { MemoryRepository } from '../data/memoryRepository';
import { createMountain } from '../domain/mountain';
import { createRecord } from '../domain/record';
import { createCustomTag } from '../domain/tags';
import { AppStore } from './store';

let dbSeq = 0;
const makeIdbStore = async () => {
  const name = `test-${++dbSeq}`;
  const s = new AppStore(new IdbRepository(name));
  await s.init();
  return { store: s, name };
};

describe('AppStore with IndexedDB', () => {
  it('seeds presets on first run', async () => {
    const { store } = await makeIdbStore();
    expect(store.state.tagCategories.length).toBeGreaterThanOrEqual(15);
    expect(store.state.tags.length).toBeGreaterThan(150);
  });

  it('add / edit / delete mountain persists across reload', async () => {
    const { store, name } = await makeIdbStore();
    const m = await store.saveMountain(createMountain({ name: 'テスト岳', elevationM: 1500, tagIds: ['terrain.ridge'] }));
    await store.saveMountain({ ...m, elevationM: 1550 });

    const reloaded = new AppStore(new IdbRepository(name));
    await reloaded.init();
    expect(reloaded.state.mountains).toHaveLength(1);
    expect(reloaded.state.mountains[0].elevationM).toBe(1550);
    expect(reloaded.state.tags.length).toBe(store.state.tags.length); // 再シードで重複しない

    await reloaded.deleteMountain(m.id);
    const again = new AppStore(new IdbRepository(name));
    await again.init();
    expect(again.state.mountains).toHaveLength(0);
  });

  it('records update status and are cascaded on mountain delete', async () => {
    const { store } = await makeIdbStore();
    const a = await store.saveMountain(createMountain({ name: 'A' }));
    const b = await store.saveMountain(createMountain({ name: 'B' }));
    await store.saveRecord(createRecord({ mountainIds: [a.id] }));
    const traverse = await store.saveRecord(createRecord({ mountainIds: [a.id, b.id] }));
    expect(store.derived.mountainById.get(a.id)!.status).toBe('climbed');
    expect(store.derived.mountainById.get(b.id)!.status).toBe('climbed');
    expect(store.derived.viewById.get(a.id)!.climbCount).toBe(2);

    const res = await store.deleteMountain(a.id);
    expect(res.deletedRecords).toBe(1);
    expect(store.state.records).toHaveLength(1);
    expect(store.state.records[0].id).toBe(traverse.id);
    expect(store.state.records[0].mountainIds).toEqual([b.id]);
  });

  it('custom tags can be added, renamed and removed (refs stripped)', async () => {
    const { store } = await makeIdbStore();
    const tag = await store.saveTag(createCustomTag('cat.preference', '猫がいる', store.state.tags));
    const m = await store.saveMountain(createMountain({ name: 'C', tagIds: [tag.id, 'terrain.ridge'] }));
    await store.saveTag({ ...tag, label: '猫に会える' });
    expect(store.derived.tagIndex.byId.get(tag.id)!.label).toBe('猫に会える');
    await store.removeTag(tag.id);
    expect(store.state.tags.find((t) => t.id === tag.id)).toBeUndefined();
    expect(store.derived.mountainById.get(m.id)!.tagIds).toEqual(['terrain.ridge']);
    await store.removeTag('terrain.ridge');
    expect(store.state.tags.find((t) => t.id === 'terrain.ridge')!.hidden).toBe(true);
    await store.restoreTag('terrain.ridge');
    expect(store.state.tags.find((t) => t.id === 'terrain.ridge')!.hidden).toBeUndefined();
  });

  it('export → reset → import(replace) restores data; merge adds', async () => {
    const { store } = await makeIdbStore();
    await store.loadSample();
    const json = store.exportJson();
    const count = store.state.mountains.length;
    await store.resetAll();
    expect(store.state.mountains).toHaveLength(0);
    const result = await store.importJson(json, 'replace');
    expect(result.counts.mountains).toBe(count);
    expect(store.state.mountains).toHaveLength(count);
    expect(store.state.records.length).toBeGreaterThan(0);

    await store.saveMountain(createMountain({ name: 'ローカルだけの山' }));
    const merged = await store.importJson(json, 'merge');
    expect(merged.report!.mountains.added).toBe(0);
    expect(store.state.mountains).toHaveLength(count + 1);
    const backups = await store.listBackups();
    expect(backups.some((b) => b.reason === 'before-import')).toBe(true);
    expect(backups.some((b) => b.reason === 'before-reset')).toBe(true);
  });

  it('restores from an internal backup', async () => {
    const { store } = await makeIdbStore();
    await store.saveMountain(createMountain({ name: '残したい山' }));
    const snap = await store.createBackup('manual');
    await store.resetAll();
    await store.restoreBackup(snap.id);
    expect(store.state.mountains.map((m) => m.name)).toEqual(['残したい山']);
  });
});

describe('AppStore auto backup (memory repo)', () => {
  it('takes an auto backup at most once per day and prunes old ones', async () => {
    const store = new AppStore(new MemoryRepository());
    await store.init();
    expect(await store.autoBackupIfNeeded(new Date('2026-01-01T00:00:00Z'))).toBe(false); // 空データでは取らない
    await store.saveMountain(createMountain({ name: 'X' }));
    for (let d = 1; d <= 10; d++) {
      expect(await store.autoBackupIfNeeded(new Date(`2026-01-${String(d).padStart(2, '0')}T09:00:00Z`))).toBe(true);
      expect(await store.autoBackupIfNeeded(new Date(`2026-01-${String(d).padStart(2, '0')}T10:00:00Z`))).toBe(false);
    }
    const autos = (await store.listBackups()).filter((b) => b.reason === 'auto');
    expect(autos).toHaveLength(7);
  });

  it('sample data can be loaded and removed', async () => {
    const store = new AppStore(new MemoryRepository());
    await store.init();
    await store.saveMountain(createMountain({ name: '自分の山' }));
    await store.loadSample();
    expect(store.hasSample()).toBe(true);
    await store.removeSample();
    expect(store.hasSample()).toBe(false);
    expect(store.state.mountains.map((m) => m.name)).toEqual(['自分の山']);
    expect(store.state.records).toHaveLength(0);
  });
});
