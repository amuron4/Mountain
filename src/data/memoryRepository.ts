import type { BackupSnapshot, ChangeSet, Dataset } from '../domain/types';
import { DEFAULT_SETTINGS } from './exportImport';
import type { Repository } from './repository';

/** テスト・IndexedDB が使えない環境用のメモリ実装 */
export class MemoryRepository implements Repository {
  private data: Dataset;
  private meta = new Map<string, unknown>();
  private backups = new Map<string, BackupSnapshot>();

  constructor(initial?: Partial<Dataset>) {
    this.data = {
      mountains: [],
      records: [],
      tagCategories: [],
      tags: [],
      settings: { ...DEFAULT_SETTINGS },
      ...structuredClone(initial ?? {}),
    };
  }

  async loadAll(): Promise<Dataset> {
    return structuredClone(this.data);
  }

  async apply(c: ChangeSet): Promise<void> {
    const upsert = <T extends { id: string }>(list: T[], items: T[] = []) => {
      const map = new Map(list.map((x) => [x.id, x]));
      items.forEach((x) => map.set(x.id, structuredClone(x)));
      return [...map.values()];
    };
    const remove = <T extends { id: string }>(list: T[], ids: string[] = []) => list.filter((x) => !ids.includes(x.id));
    const d = this.data;
    d.mountains = remove(upsert(d.mountains, c.put?.mountains), c.delete?.mountains);
    d.records = remove(upsert(d.records, c.put?.records), c.delete?.records);
    d.tagCategories = remove(upsert(d.tagCategories, c.put?.tagCategories), c.delete?.tagCategories);
    d.tags = remove(upsert(d.tags, c.put?.tags), c.delete?.tags);
    if (c.settings) d.settings = structuredClone(c.settings);
  }

  async replaceAll(data: Dataset): Promise<void> {
    this.data = structuredClone(data);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.meta.get(key) as T | undefined;
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    this.meta.set(key, value);
  }

  async listBackups(): Promise<BackupSnapshot[]> {
    return [...this.backups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveBackup(s: BackupSnapshot): Promise<void> {
    this.backups.set(s.id, structuredClone(s));
  }

  async deleteBackup(id: string): Promise<void> {
    this.backups.delete(id);
  }
}
