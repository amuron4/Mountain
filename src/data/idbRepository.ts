import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BackupSnapshot, ChangeSet, ClimbRecord, Dataset, Mountain, Settings, Tag, TagCategory } from '../domain/types';
import { DEFAULT_SETTINGS, sanitizeSettings } from './exportImport';
import type { Repository } from './repository';

export const DB_NAME = 'yama-note';
/** IndexedDB のスキーマバージョン。ストアやインデックスを追加したら上げて upgrade に処理を足す */
export const DB_VERSION = 1;

interface YamaDB extends DBSchema {
  mountains: { key: string; value: Mountain; indexes: { status: string; updatedAt: string } };
  records: { key: string; value: ClimbRecord; indexes: { date: string; mountainIds: string } };
  tagCategories: { key: string; value: TagCategory };
  tags: { key: string; value: Tag; indexes: { categoryId: string } };
  meta: { key: string; value: unknown };
  backups: { key: string; value: BackupSnapshot; indexes: { createdAt: string } };
}

const SETTINGS_KEY = 'settings';

export class IdbRepository implements Repository {
  private dbPromise: Promise<IDBPDatabase<YamaDB>>;

  constructor(name = DB_NAME) {
    this.dbPromise = openDB<YamaDB>(name, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const m = db.createObjectStore('mountains', { keyPath: 'id' });
          m.createIndex('status', 'status');
          m.createIndex('updatedAt', 'updatedAt');
          const r = db.createObjectStore('records', { keyPath: 'id' });
          r.createIndex('date', 'date');
          r.createIndex('mountainIds', 'mountainIds', { multiEntry: true });
          db.createObjectStore('tagCategories', { keyPath: 'id' });
          const t = db.createObjectStore('tags', { keyPath: 'id' });
          t.createIndex('categoryId', 'categoryId');
          db.createObjectStore('meta');
          const b = db.createObjectStore('backups', { keyPath: 'id' });
          b.createIndex('createdAt', 'createdAt');
        }
        // 将来: if (oldVersion < 2) { ... }
      },
    });
  }

  async loadAll(): Promise<Dataset> {
    const db = await this.dbPromise;
    const tx = db.transaction(['mountains', 'records', 'tagCategories', 'tags', 'meta'], 'readonly');
    const [mountains, records, tagCategories, tags, settings] = await Promise.all([
      tx.objectStore('mountains').getAll(),
      tx.objectStore('records').getAll(),
      tx.objectStore('tagCategories').getAll(),
      tx.objectStore('tags').getAll(),
      tx.objectStore('meta').get(SETTINGS_KEY),
    ]);
    await tx.done;
    return { mountains, records, tagCategories, tags, settings: settings ? sanitizeSettings(settings) : { ...DEFAULT_SETTINGS } };
  }

  async apply(changes: ChangeSet): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['mountains', 'records', 'tagCategories', 'tags', 'meta'], 'readwrite');
    const ops: Promise<unknown>[] = [];
    const p = changes.put ?? {};
    const d = changes.delete ?? {};
    for (const x of p.mountains ?? []) ops.push(tx.objectStore('mountains').put(x));
    for (const x of p.records ?? []) ops.push(tx.objectStore('records').put(x));
    for (const x of p.tagCategories ?? []) ops.push(tx.objectStore('tagCategories').put(x));
    for (const x of p.tags ?? []) ops.push(tx.objectStore('tags').put(x));
    for (const id of d.mountains ?? []) ops.push(tx.objectStore('mountains').delete(id));
    for (const id of d.records ?? []) ops.push(tx.objectStore('records').delete(id));
    for (const id of d.tagCategories ?? []) ops.push(tx.objectStore('tagCategories').delete(id));
    for (const id of d.tags ?? []) ops.push(tx.objectStore('tags').delete(id));
    if (changes.settings) ops.push(tx.objectStore('meta').put(changes.settings, SETTINGS_KEY));
    await Promise.all([...ops, tx.done]);
  }

  async replaceAll(data: Dataset): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['mountains', 'records', 'tagCategories', 'tags', 'meta'], 'readwrite');
    await Promise.all([
      tx.objectStore('mountains').clear(),
      tx.objectStore('records').clear(),
      tx.objectStore('tagCategories').clear(),
      tx.objectStore('tags').clear(),
    ]);
    const ops: Promise<unknown>[] = [];
    data.mountains.forEach((x) => ops.push(tx.objectStore('mountains').put(x)));
    data.records.forEach((x) => ops.push(tx.objectStore('records').put(x)));
    data.tagCategories.forEach((x) => ops.push(tx.objectStore('tagCategories').put(x)));
    data.tags.forEach((x) => ops.push(tx.objectStore('tags').put(x)));
    ops.push(tx.objectStore('meta').put(data.settings as Settings, SETTINGS_KEY));
    await Promise.all([...ops, tx.done]);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.dbPromise;
    return (await db.get('meta', key)) as T | undefined;
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await this.dbPromise;
    await db.put('meta', value, key);
  }

  async listBackups(): Promise<BackupSnapshot[]> {
    const db = await this.dbPromise;
    const all = await db.getAllFromIndex('backups', 'createdAt');
    return all.reverse();
  }

  async saveBackup(snapshot: BackupSnapshot): Promise<void> {
    const db = await this.dbPromise;
    await db.put('backups', snapshot);
  }

  async deleteBackup(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('backups', id);
  }
}
