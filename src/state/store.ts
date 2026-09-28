/**
 * アプリ全体の状態とユースケース（UI フレームワーク非依存）。
 * - データは起動時にすべてメモリへ読み込み、変更は ChangeSet として Repository に書き込む。
 * - 派生データ（MountainView・タグ索引など）はデータが変わったときだけ再計算する。
 */
import { backupsToPrune, makeSnapshot, shouldAutoBackup } from '../data/backup';
import { DEFAULT_SETTINGS, mergeDatasets, parseExport, repairReferences, serializeDataset, type MergeReport } from '../data/exportImport';
import type { Repository } from '../data/repository';
import { buildSampleData, isSample } from '../data/sample';
import { linkMountainToMaster, mountainFromMaster, RegisteredLookup } from '../domain/master/link';
import type { MountainMaster } from '../domain/master/types';
import { buildMountainViews, personalPace, statusAfterRecord, type MountainView } from '../domain/mountain';
import { PRESET_VERSION } from '../domain/presets';
import { buildTagIndex, missingPresets, planTagRemoval, type TagIndex } from '../domain/tags';
import type { BackupSnapshot, ChangeSet, ClimbRecord, Dataset, ID, Mountain, Settings, Tag, TagCategory } from '../domain/types';
import { nowIso } from '../domain/util';

const PRESET_VERSION_KEY = 'presetVersion';

export interface Derived {
  views: MountainView[];
  viewById: Map<ID, MountainView>;
  mountainById: Map<ID, Mountain>;
  tagIndex: TagIndex;
  pace?: number;
}

export type ImportMode = 'replace' | 'merge';

export interface ImportResult {
  mode: ImportMode;
  counts: { mountains: number; records: number; tags: number };
  skipped: number;
  report?: MergeReport;
}

export class AppStore {
  private data: Dataset = { mountains: [], records: [], tagCategories: [], tags: [], settings: { ...DEFAULT_SETTINGS } };
  private derivedCache?: Derived;
  private listeners = new Set<() => void>();
  ready = false;
  version = 0;

  constructor(private repo: Repository) {}

  // ---------------------------------------------------------------- 購読
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.version++;
    this.derivedCache = undefined;
    this.listeners.forEach((fn) => fn());
  }

  get state(): Dataset {
    return this.data;
  }

  get derived(): Derived {
    if (!this.derivedCache) {
      const views = buildMountainViews(this.data.mountains, this.data.records);
      this.derivedCache = {
        views,
        viewById: new Map(views.map((v) => [v.mountain.id, v])),
        mountainById: new Map(this.data.mountains.map((m) => [m.id, m])),
        tagIndex: buildTagIndex(this.data.tagCategories, this.data.tags),
        pace: personalPace(this.data.records),
      };
    }
    return this.derivedCache;
  }

  // ---------------------------------------------------------------- 起動
  async init(): Promise<void> {
    this.data = await this.repo.loadAll();
    await this.ensurePresets();
    this.ready = true;
    this.emit();
    // 自動バックアップは起動をブロックしない
    void this.autoBackupIfNeeded();
  }

  /** 初回起動・プリセット更新時に、不足しているプリセットタグを追加する */
  private async ensurePresets() {
    const stored = (await this.repo.getMeta<number>(PRESET_VERSION_KEY)) ?? 0;
    if (stored >= PRESET_VERSION && this.data.tagCategories.length > 0) return;
    const missing = missingPresets(this.data.tagCategories, this.data.tags);
    if (missing.categories.length || missing.tags.length) {
      await this.repo.apply({ put: { tagCategories: missing.categories, tags: missing.tags } });
      this.data.tagCategories = [...this.data.tagCategories, ...missing.categories];
      this.data.tags = [...this.data.tags, ...missing.tags];
    }
    await this.repo.setMeta(PRESET_VERSION_KEY, PRESET_VERSION);
  }

  private async commit(changes: ChangeSet) {
    await this.repo.apply(changes);
    const upsert = <T extends { id: string }>(list: T[], items?: T[]) => {
      if (!items?.length) return list;
      const map = new Map(list.map((x) => [x.id, x]));
      items.forEach((x) => map.set(x.id, x));
      return [...map.values()];
    };
    const remove = <T extends { id: string }>(list: T[], ids?: string[]) => (ids?.length ? list.filter((x) => !ids.includes(x.id)) : list);
    const d = this.data;
    this.data = {
      mountains: remove(upsert(d.mountains, changes.put?.mountains), changes.delete?.mountains),
      records: remove(upsert(d.records, changes.put?.records), changes.delete?.records),
      tagCategories: remove(upsert(d.tagCategories, changes.put?.tagCategories), changes.delete?.tagCategories),
      tags: remove(upsert(d.tags, changes.put?.tags), changes.delete?.tags),
      settings: changes.settings ?? d.settings,
    };
    this.emit();
  }

  // ---------------------------------------------------------------- 山
  async saveMountain(m: Mountain): Promise<Mountain> {
    const saved = { ...m, name: m.name.trim(), updatedAt: nowIso() };
    await this.commit({ put: { mountains: [saved] } });
    return saved;
  }

  /**
   * 山マスターの山を自分の山として登録する（ワンタップ登録）。
   * 既に同じ山（masterId 一致、または近接＋同名）が登録済みなら新規作成せず、それを返す。
   */
  async registerFromMaster(master: MountainMaster): Promise<{ mountain: Mountain; created: boolean }> {
    const existing = new RegisteredLookup(this.data.mountains).find(master);
    if (existing) return { mountain: existing, created: false };
    const mountain = await this.saveMountain(mountainFromMaster(master));
    return { mountain, created: true };
  }

  /** 既存の山（手入力で位置なし）を山マスターに紐づける。入力済みの値は保持し、空欄だけ補う */
  async linkToMaster(mountainId: ID, master: MountainMaster): Promise<Mountain | undefined> {
    const m = this.derived.mountainById.get(mountainId);
    if (!m) return undefined;
    return this.saveMountain(linkMountainToMaster(m, master));
  }

  async patchMountain(id: ID, patch: Partial<Mountain>): Promise<void> {
    const m = this.derived.mountainById.get(id);
    if (!m) return;
    await this.commit({ put: { mountains: [{ ...m, ...patch, updatedAt: nowIso() }] } });
  }

  /**
   * 山を削除する。その山だけの山行記録は削除し、縦走などで他の山も含む記録は参照だけ外す。
   */
  async deleteMountain(id: ID): Promise<{ deletedRecords: number }> {
    const affected = this.data.records.filter((r) => r.mountainIds.includes(id));
    const toDelete = affected.filter((r) => r.mountainIds.every((x) => x === id)).map((r) => r.id);
    const toUpdate = affected
      .filter((r) => !toDelete.includes(r.id))
      .map((r) => ({ ...r, mountainIds: r.mountainIds.filter((x) => x !== id), updatedAt: nowIso() }));
    await this.commit({ put: { records: toUpdate }, delete: { mountains: [id], records: toDelete } });
    return { deletedRecords: toDelete.length };
  }

  // ---------------------------------------------------------------- 山行記録
  async saveRecord(r: ClimbRecord): Promise<ClimbRecord> {
    const saved = { ...r, updatedAt: nowIso() };
    // 記録した山が「未踏」なら「登頂済み」へ自動更新
    const mountains: Mountain[] = [];
    for (const mid of saved.mountainIds) {
      const m = this.derived.mountainById.get(mid);
      if (!m) continue;
      const next = statusAfterRecord(m, saved);
      if (next !== m.status) mountains.push({ ...m, status: next, updatedAt: nowIso() });
    }
    await this.commit({ put: { records: [saved], mountains } });
    return saved;
  }

  async deleteRecord(id: ID): Promise<void> {
    await this.commit({ delete: { records: [id] } });
  }

  // ---------------------------------------------------------------- タグ
  async saveTag(tag: Tag): Promise<Tag> {
    const saved = { ...tag, label: tag.label.trim(), updatedAt: nowIso() };
    await this.commit({ put: { tags: [saved] } });
    return saved;
  }

  async removeTag(id: ID): Promise<void> {
    const tag = this.data.tags.find((t) => t.id === id);
    if (!tag) return;
    const plan = planTagRemoval(tag, this.data.mountains, this.data.records);
    await this.commit({
      put: { mountains: plan.mountains, records: plan.records, tags: plan.hideTag ? [plan.hideTag] : [] },
      delete: { tags: plan.deleteTagId ? [plan.deleteTagId] : [] },
    });
  }

  async restoreTag(id: ID): Promise<void> {
    const tag = this.data.tags.find((t) => t.id === id);
    if (!tag) return;
    await this.commit({ put: { tags: [{ ...tag, hidden: undefined, updatedAt: nowIso() }] } });
  }

  async saveCategory(cat: TagCategory): Promise<TagCategory> {
    const saved = { ...cat, name: cat.name.trim(), updatedAt: nowIso() };
    await this.commit({ put: { tagCategories: [saved] } });
    return saved;
  }

  /** カテゴリ削除: プリセットは非表示、カスタムはタグごと削除（山・記録からも外す） */
  async removeCategory(id: ID): Promise<void> {
    const cat = this.data.tagCategories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.builtin) {
      await this.commit({ put: { tagCategories: [{ ...cat, hidden: true, updatedAt: nowIso() }] } });
      return;
    }
    const tagIds = new Set(this.data.tags.filter((t) => t.categoryId === id).map((t) => t.id));
    const now = nowIso();
    const mountains = this.data.mountains
      .filter((m) => m.tagIds.some((t) => tagIds.has(t)))
      .map((m) => ({ ...m, tagIds: m.tagIds.filter((t) => !tagIds.has(t)), updatedAt: now }));
    const records = this.data.records
      .filter((r) => r.tagIds.some((t) => tagIds.has(t)))
      .map((r) => ({ ...r, tagIds: r.tagIds.filter((t) => !tagIds.has(t)), updatedAt: now }));
    await this.commit({ put: { mountains, records }, delete: { tagCategories: [id], tags: [...tagIds] } });
  }

  async restoreCategory(id: ID): Promise<void> {
    const cat = this.data.tagCategories.find((c) => c.id === id);
    if (!cat) return;
    await this.commit({ put: { tagCategories: [{ ...cat, hidden: undefined, updatedAt: nowIso() }] } });
  }

  /** 並び順の入れ替え */
  async moveCategory(id: ID, dir: -1 | 1): Promise<void> {
    const cats = [...this.data.tagCategories].filter((c) => !c.hidden).sort((a, b) => a.order - b.order);
    const i = cats.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    const a = cats[i];
    const b = cats[j];
    const now = nowIso();
    await this.commit({ put: { tagCategories: [{ ...a, order: b.order, updatedAt: now }, { ...b, order: a.order, updatedAt: now }] } });
  }

  // ---------------------------------------------------------------- 設定
  async updateSettings(patch: Partial<Settings>): Promise<void> {
    await this.commit({ settings: { ...this.data.settings, ...patch } });
  }

  // ---------------------------------------------------------------- エクスポート / インポート
  exportJson(): string {
    return serializeDataset(this.data);
  }

  async markExported(): Promise<void> {
    await this.updateSettings({ lastExportAt: nowIso() });
  }

  async importJson(text: string, mode: ImportMode): Promise<ImportResult> {
    const parsed = parseExport(text);
    // インポート前に必ず端末内バックアップを取る
    await this.createBackup('before-import');
    let next: Dataset;
    let report: MergeReport | undefined;
    if (mode === 'replace') {
      next = { ...parsed.data, settings: { ...parsed.data.settings, lastExportAt: this.data.settings.lastExportAt } };
    } else {
      const merged = mergeDatasets(this.data, parsed.data);
      next = merged.data;
      report = merged.report;
    }
    next = repairReferences(next);
    // 読み込んだデータに不足しているプリセットを補う
    const missing = missingPresets(next.tagCategories, next.tags);
    next = { ...next, tagCategories: [...next.tagCategories, ...missing.categories], tags: [...next.tags, ...missing.tags] };
    await this.repo.replaceAll(next);
    this.data = next;
    this.emit();
    const s = parsed.skipped;
    return {
      mode,
      counts: { mountains: parsed.data.mountains.length, records: parsed.data.records.length, tags: parsed.data.tags.length },
      skipped: s.mountains + s.records + s.tags + s.tagCategories,
      report,
    };
  }

  // ---------------------------------------------------------------- バックアップ
  async createBackup(reason: BackupSnapshot['reason']): Promise<BackupSnapshot> {
    const snap = makeSnapshot(this.data, reason);
    await this.repo.saveBackup(snap);
    const list = await this.repo.listBackups();
    for (const id of backupsToPrune(list)) await this.repo.deleteBackup(id);
    return snap;
  }

  async autoBackupIfNeeded(now = new Date()): Promise<boolean> {
    if (!shouldAutoBackup(this.data, this.data.settings.lastAutoBackupAt, now)) return false;
    await this.createBackup('auto');
    await this.updateSettings({ lastAutoBackupAt: now.toISOString() });
    return true;
  }

  listBackups(): Promise<BackupSnapshot[]> {
    return this.repo.listBackups();
  }

  deleteBackup(id: ID): Promise<void> {
    return this.repo.deleteBackup(id);
  }

  async restoreBackup(id: ID): Promise<void> {
    const snap = (await this.repo.listBackups()).find((b) => b.id === id);
    if (!snap) throw new Error('バックアップが見つかりません');
    await this.importJson(snap.payload, 'replace');
  }

  // ---------------------------------------------------------------- サンプル・リセット
  hasSample(): boolean {
    return this.data.mountains.some(isSample);
  }

  async loadSample(): Promise<void> {
    const { mountains, records } = buildSampleData();
    await this.commit({ put: { mountains, records } });
  }

  async removeSample(): Promise<void> {
    await this.commit({
      delete: {
        mountains: this.data.mountains.filter(isSample).map((m) => m.id),
        records: this.data.records.filter(isSample).map((r) => r.id),
      },
    });
  }

  async resetAll(): Promise<void> {
    await this.createBackup('before-reset');
    const empty: Dataset = { mountains: [], records: [], tagCategories: [], tags: [], settings: { ...DEFAULT_SETTINGS } };
    const presets = missingPresets([], []);
    const next = { ...empty, tagCategories: presets.categories, tags: presets.tags };
    await this.repo.replaceAll(next);
    this.data = next;
    this.emit();
  }
}
