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

describe('山マスターからの登録と既存データ互換性', () => {
  const master = {
    id: 'g35951613909781imf6ww',
    name: '武甲山',
    kana: 'ぶこうざん',
    latitude: 35.95162,
    longitude: 139.097785,
    prefectures: ['埼玉県'],
    source: 'gsi-vt',
  };

  it('5. registers from master as a normal Mountain that can be edited and persisted', async () => {
    const { store, name } = await makeIdbStore();
    const { mountain, created } = await store.registerFromMaster(master);
    expect(created).toBe(true);
    expect(mountain).toMatchObject({ name: '武甲山', kana: 'ぶこうざん', prefectures: ['埼玉県'], region: '関東', masterId: master.id, status: 'unclimbed' });
    expect(mountain.location).toEqual({ lat: 35.95162, lng: 139.097785 });
    expect(mountain.elevationM).toBeUndefined();

    await store.saveMountain({ ...mountain, elevationM: 1304, wish: 3, tagIds: ['terrain.ridge'], memo: '石灰岩の山' });
    await store.saveRecord(createRecord({ mountainIds: [mountain.id], date: '2026-05-01' }));

    const reloaded = new AppStore(new IdbRepository(name));
    await reloaded.init();
    const m = reloaded.derived.mountainById.get(mountain.id)!;
    expect(m).toMatchObject({ elevationM: 1304, wish: 3, memo: '石灰岩の山', masterId: master.id, status: 'climbed' });
    expect(reloaded.derived.viewById.get(mountain.id)!.climbCount).toBe(1);
    // 山マスターはユーザーの mountains に混ざらない
    expect(reloaded.state.mountains).toHaveLength(1);
  });

  it('6. does not create a duplicate when the same master mountain is registered twice', async () => {
    const { store } = await makeIdbStore();
    const first = await store.registerFromMaster(master);
    const second = await store.registerFromMaster(master);
    expect(second.created).toBe(false);
    expect(second.mountain.id).toBe(first.mountain.id);
    expect(store.state.mountains).toHaveLength(1);
    // 同名でも別の山（座標が遠い）は別物として登録できる
    const other = await store.registerFromMaster({ ...master, id: 'other', latitude: 36.5, longitude: 138.5 });
    expect(other.created).toBe(true);
    expect(store.state.mountains).toHaveLength(2);
  });

  it('keeps masterId and location through JSON export / import', async () => {
    const { store } = await makeIdbStore();
    await store.registerFromMaster(master);
    const json = store.exportJson();
    await store.resetAll();
    await store.importJson(json, 'replace');
    expect(store.state.mountains[0]).toMatchObject({ masterId: master.id, location: { lat: 35.95162, lng: 139.097785 } });
  });

  it('10. loads IndexedDB data written by the previous app version unchanged', async () => {
    const { openDB } = await import('idb');
    const dbName = `legacy-${++dbSeq}`;
    // 旧バージョンと同じ DB を先に作っておく（masterId などの新フィールドは無い）
    const seed = new AppStore(new IdbRepository(dbName));
    await seed.init();
    const db = await openDB(dbName, 1);
    const legacyMountain = {
      id: 'mtn_legacy',
      name: '塔ノ岳',
      kana: 'とうのだけ',
      region: '関東',
      prefectures: ['神奈川県'],
      elevationM: 1491,
      range: '丹沢',
      status: 'climbed',
      favorite: true,
      wish: 0,
      tagIds: ['terrain.ridge'],
      courses: [{ id: 'crs_1', name: '大倉尾根', distanceKm: 14.2, ascentM: 1270, courseTimeMin: 440 }],
      ratings: { stamina: 4 },
      memo: '旧データ',
      links: [],
      photos: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const legacyRecord = { ...createRecord({ mountainIds: ['mtn_legacy'], date: '2025-01-02', distanceKm: 14.2 }), id: 'rec_legacy' };
    await db.put('mountains', legacyMountain);
    await db.put('records', legacyRecord);
    db.close();

    const updated = new AppStore(new IdbRepository(dbName));
    await updated.init();
    expect(updated.state.mountains).toEqual([legacyMountain]);
    expect(updated.state.records).toEqual([legacyRecord]);
    expect(updated.derived.viewById.get('mtn_legacy')!.distanceKm.value).toBe(14.2);
    // 旧データも編集・保存できる
    await updated.saveMountain({ ...updated.state.mountains[0], memo: '更新後' });
    expect(updated.state.mountains[0].memo).toBe('更新後');
    expect(updated.state.mountains[0].masterId).toBeUndefined();
    // 旧データを座標なしで登録していても、マスター登録は別物として扱われる（名前だけで重複判定しない）
    const r = await updated.registerFromMaster({ ...master, id: 'tounodake', name: '塔ノ岳', kana: 'とうのだけ', latitude: 35.4542, longitude: 139.1633, prefectures: ['神奈川県'] });
    expect(r.created).toBe(true);
  });
});

describe('位置情報のない同名の山への紐づけ', () => {
  it('links an existing manual mountain to master without overwriting user input', async () => {
    const store = new AppStore(new MemoryRepository());
    await store.init();
    const manual = await store.saveMountain(createMountain({ name: '塔ノ岳', prefectures: ['神奈川県'], elevationM: 1491, memo: '手入力' }));
    const master = { id: 'm1', name: '塔ノ岳', kana: 'とうのだけ', latitude: 35.4542, longitude: 139.1633, prefectures: ['神奈川県'], source: 'gsi-vt' };
    const { RegisteredLookup } = await import('../domain/master/link');
    expect(new RegisteredLookup(store.state.mountains).find(master)).toBeUndefined();
    expect(new RegisteredLookup(store.state.mountains).findSimilarUnlocated(master)?.id).toBe(manual.id);
    await store.linkToMaster(manual.id, master);
    const linked = store.derived.mountainById.get(manual.id)!;
    expect(linked).toMatchObject({ masterId: 'm1', kana: 'とうのだけ', elevationM: 1491, memo: '手入力', location: { lat: 35.4542, lng: 139.1633 } });
    expect(new RegisteredLookup(store.state.mountains).find(master)?.id).toBe(manual.id);
    expect((await store.registerFromMaster(master)).created).toBe(false);
  });
});
