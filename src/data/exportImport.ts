/**
 * JSON エクスポート / インポート。
 * - 形式にバージョン（format）を持たせ、将来のスキーマ変更時は migrate() で変換する。
 * - インポート時は各エンティティを sanitize して、壊れた値が DB に入らないようにする。
 * - マージ時は updatedAt が新しい方を採用（将来のクラウド同期と同じ方針）。
 */
import { sanitizeRatings } from '../domain/ratings';
import type {
  ClimbRecord,
  Course,
  Dataset,
  LinkRef,
  Mountain,
  MountainStatus,
  PhotoRef,
  Settings,
  Tag,
  TagCategory,
} from '../domain/types';
import { isFiniteNumber, newId, nowIso, uniq } from '../domain/util';

export const APP_ID = 'yama-note';
export const EXPORT_FORMAT = 1;

export interface ExportFile {
  app: typeof APP_ID;
  format: number;
  exportedAt: string;
  data: Dataset;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  nearbyMinutes: 120,
  homeArea: '',
  autoBackup: true,
};

export function serializeDataset(data: Dataset, exportedAt = nowIso()): string {
  const file: ExportFile = { app: APP_ID, format: EXPORT_FORMAT, exportedAt, data };
  return JSON.stringify(file, null, 2);
}

export function exportFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `yama-note-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : isFiniteNumber(v) ? String(v) : d);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (isFiniteNumber(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === 'string' && x !== '')) : []);
const ts = (v: unknown): string => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : nowIso());
const ext = (v: unknown): Obj | undefined => (isObj(v) ? v : undefined);
const dateStr = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

const STATUSES: MountainStatus[] = ['unclimbed', 'climbed', 'revisit'];

function sanitizeCourse(v: unknown): Course | undefined {
  if (!isObj(v)) return undefined;
  return {
    id: str(v.id) || newId('crs'),
    name: str(v.name),
    start: optStr(v.start),
    goal: optStr(v.goal),
    distanceKm: num(v.distanceKm),
    ascentM: num(v.ascentM),
    descentM: num(v.descentM),
    courseTimeMin: num(v.courseTimeMin),
    note: optStr(v.note),
  };
}

function sanitizePhotos(v: unknown): PhotoRef[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .filter((p) => (p.storage === 'idb' || p.storage === 'url') && typeof p.ref === 'string')
    .map((p) => ({ id: str(p.id) || newId('pho'), storage: p.storage as 'idb' | 'url', ref: str(p.ref), caption: optStr(p.caption), takenAt: optStr(p.takenAt) }));
}

function sanitizeLinks(v: unknown): LinkRef[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).filter((l) => typeof l.url === 'string').map((l) => ({ label: str(l.label), url: str(l.url) }));
}

export function sanitizeMountain(v: unknown): Mountain | undefined {
  if (!isObj(v) || typeof v.name !== 'string' || !v.name.trim()) return undefined;
  const loc = isObj(v.location) && isFiniteNumber(v.location.lat) && isFiniteNumber(v.location.lng) ? { lat: v.location.lat, lng: v.location.lng } : undefined;
  const wish = num(v.wish) ?? 0;
  return {
    id: str(v.id) || newId('mtn'),
    name: v.name.trim(),
    kana: str(v.kana),
    region: str(v.region),
    prefectures: strArr(v.prefectures),
    elevationM: num(v.elevationM),
    range: str(v.range),
    status: STATUSES.includes(v.status as MountainStatus) ? (v.status as MountainStatus) : 'unclimbed',
    favorite: bool(v.favorite),
    wish: Math.max(0, Math.min(3, Math.round(wish))),
    tagIds: strArr(v.tagIds),
    courses: Array.isArray(v.courses) ? v.courses.map(sanitizeCourse).filter((c): c is Course => !!c) : [],
    accessMinutes: num(v.accessMinutes),
    accessNote: optStr(v.accessNote),
    ratings: sanitizeRatings(v.ratings),
    memo: str(v.memo),
    links: sanitizeLinks(v.links),
    photos: sanitizePhotos(v.photos),
    location: loc,
    createdAt: ts(v.createdAt),
    updatedAt: ts(v.updatedAt),
    ext: ext(v.ext),
  };
}

export function sanitizeRecord(v: unknown): ClimbRecord | undefined {
  if (!isObj(v)) return undefined;
  const mountainIds = strArr(v.mountainIds);
  const date = dateStr(v.date);
  if (!mountainIds.length || !date) return undefined;
  return {
    id: str(v.id) || newId('rec'),
    mountainIds,
    date,
    endDate: dateStr(v.endDate),
    summitReached: bool(v.summitReached, true),
    courseName: str(v.courseName),
    start: str(v.start),
    goal: str(v.goal),
    distanceKm: num(v.distanceKm),
    ascentM: num(v.ascentM),
    descentM: num(v.descentM),
    durationMin: num(v.durationMin),
    courseTimeMin: num(v.courseTimeMin),
    weather: str(v.weather),
    temperatureC: num(v.temperatureC),
    trailCondition: str(v.trailCondition),
    crowd: str(v.crowd),
    transport: strArr(v.transport),
    gear: str(v.gear),
    companions: str(v.companions),
    impressions: str(v.impressions),
    ratings: sanitizeRatings(v.ratings),
    tagIds: strArr(v.tagIds),
    photos: sanitizePhotos(v.photos),
    track: isObj(v.track) && (v.track.format === 'gpx' || v.track.format === 'geojson') ? { format: v.track.format, ref: str(v.track.ref) } : undefined,
    createdAt: ts(v.createdAt),
    updatedAt: ts(v.updatedAt),
    ext: ext(v.ext),
  };
}

export function sanitizeCategory(v: unknown): TagCategory | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return undefined;
  return {
    id: v.id,
    name: v.name,
    description: optStr(v.description),
    icon: optStr(v.icon),
    order: num(v.order) ?? 999,
    builtin: bool(v.builtin),
    hidden: bool(v.hidden) || undefined,
    createdAt: ts(v.createdAt),
    updatedAt: ts(v.updatedAt),
    ext: ext(v.ext),
  };
}

export function sanitizeTag(v: unknown): Tag | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.label !== 'string' || typeof v.categoryId !== 'string') return undefined;
  const aliases = strArr(v.aliases);
  return {
    id: v.id,
    categoryId: v.categoryId,
    label: v.label,
    order: num(v.order) ?? 999,
    builtin: bool(v.builtin),
    hidden: bool(v.hidden) || undefined,
    aliases: aliases.length ? aliases : undefined,
    createdAt: ts(v.createdAt),
    updatedAt: ts(v.updatedAt),
    ext: ext(v.ext),
  };
}

export function sanitizeSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  const theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto';
  return {
    theme,
    nearbyMinutes: num(s.nearbyMinutes) ?? DEFAULT_SETTINGS.nearbyMinutes,
    homeArea: str(s.homeArea),
    autoBackup: bool(s.autoBackup, true),
    lastExportAt: optStr(s.lastExportAt),
    lastAutoBackupAt: optStr(s.lastAutoBackupAt),
  };
}

// ---------------------------------------------------------------------------
// parse / migrate
// ---------------------------------------------------------------------------

export class ImportError extends Error {}

export interface ParseResult {
  data: Dataset;
  exportedAt?: string;
  /** 読み込めずに捨てた件数 */
  skipped: { mountains: number; records: number; tags: number; tagCategories: number };
}

/** 旧形式 → 現形式への変換（今後 format が上がったらここに追加） */
function migrate(file: Obj): Obj {
  const format = num(file.format) ?? 1;
  if (format > EXPORT_FORMAT) {
    throw new ImportError(`このファイルは新しいバージョンのアプリで作成されています（format ${format}）。アプリを更新してください。`);
  }
  return file;
}

function sanitizeList<T>(raw: unknown, fn: (v: unknown) => T | undefined): { items: T[]; skipped: number } {
  if (!Array.isArray(raw)) return { items: [], skipped: 0 };
  const items = raw.map(fn).filter((x): x is T => !!x);
  return { items, skipped: raw.length - items.length };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it);
  return [...map.values()];
}

export function parseExport(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('JSON として読み込めませんでした。ファイルが壊れていないか確認してください。');
  }
  if (!isObj(json) || json.app !== APP_ID || !isObj(json.data)) {
    throw new ImportError('山ノートのバックアップファイルではないようです。');
  }
  const file = migrate(json);
  const d = file.data as Obj;
  const mountains = sanitizeList(d.mountains, sanitizeMountain);
  const records = sanitizeList(d.records, sanitizeRecord);
  const cats = sanitizeList(d.tagCategories, sanitizeCategory);
  const tags = sanitizeList(d.tags, sanitizeTag);
  return {
    data: {
      mountains: dedupeById(mountains.items),
      records: dedupeById(records.items),
      tagCategories: dedupeById(cats.items),
      tags: dedupeById(tags.items),
      settings: sanitizeSettings(d.settings),
    },
    exportedAt: optStr(file.exportedAt),
    skipped: { mountains: mountains.skipped, records: records.skipped, tags: tags.skipped, tagCategories: cats.skipped },
  };
}

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

function mergeEntities<T extends { id: string; updatedAt: string }>(current: T[], incoming: T[]): { merged: T[]; added: number; updated: number } {
  const map = new Map(current.map((x) => [x.id, x]));
  let added = 0;
  let updated = 0;
  for (const it of incoming) {
    const cur = map.get(it.id);
    if (!cur) {
      map.set(it.id, it);
      added++;
    } else if (it.updatedAt > cur.updatedAt) {
      map.set(it.id, it);
      updated++;
    }
  }
  return { merged: [...map.values()], added, updated };
}

export interface MergeReport {
  mountains: { added: number; updated: number };
  records: { added: number; updated: number };
  tags: { added: number; updated: number };
  tagCategories: { added: number; updated: number };
}

/** 統合インポート: ID が同じものは updatedAt が新しい方を採用。設定は現在のものを維持。 */
export function mergeDatasets(current: Dataset, incoming: Dataset): { data: Dataset; report: MergeReport } {
  const m = mergeEntities(current.mountains, incoming.mountains);
  const r = mergeEntities(current.records, incoming.records);
  const t = mergeEntities(current.tags, incoming.tags);
  const c = mergeEntities(current.tagCategories, incoming.tagCategories);
  return {
    data: { mountains: m.merged, records: r.merged, tags: t.merged, tagCategories: c.merged, settings: current.settings },
    report: {
      mountains: { added: m.added, updated: m.updated },
      records: { added: r.added, updated: r.updated },
      tags: { added: t.added, updated: t.updated },
      tagCategories: { added: c.added, updated: c.updated },
    },
  };
}

/** 山行記録が参照している山が存在するか等の整合性チェック（壊れた参照を取り除く） */
export function repairReferences(data: Dataset): Dataset {
  const mountainIds = new Set(data.mountains.map((m) => m.id));
  const records = data.records
    .map((r) => ({ ...r, mountainIds: r.mountainIds.filter((id) => mountainIds.has(id)) }))
    .filter((r) => r.mountainIds.length > 0);
  const catIds = new Set(data.tagCategories.map((c) => c.id));
  const tags = data.tags.filter((t) => catIds.has(t.categoryId));
  return { ...data, records, tags };
}
