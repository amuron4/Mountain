/**
 * 山マスターの読み込み（ユーザーデータの Repository / IndexedDB とは完全に別管理）。
 *
 * - public/master/manifest.json と都道府県別チャンクを fetch する。
 *   Service Worker がプリキャッシュするので、一度アプリを開いた後はオフラインでも読める。
 * - アプリ起動時には読み込まない。検索 UI を初めて使うときに遅延ロードし、以後はメモリに保持する。
 */
import { prefectureByCode } from '../domain/geo';
import type { MasterChunkFile, MasterManifest, MountainMaster } from '../domain/master/types';

export interface MasterRepository {
  loadManifest(): Promise<MasterManifest>;
  /** 全件（manifest のチャンクをすべて読み込む） */
  loadAll(): Promise<MountainMaster[]>;
}

export function rowsToMasters(chunk: MasterChunkFile): MountainMaster[] {
  return chunk.rows.map(([id, name, kana, lat, lon, codes, elev, aliases, range, elevationSource]) => ({
    id,
    name,
    kana,
    latitude: lat,
    longitude: lon,
    prefectures: codes.map((c) => prefectureByCode(c) ?? c),
    elevationM: typeof elev === 'number' ? elev : undefined,
    aliases: aliases && aliases.length ? aliases : undefined,
    range: range || undefined,
    source: chunk.source,
    elevationSource: typeof elev === 'number' ? elevationSource ?? undefined : undefined,
  }));
}

export class StaticMasterRepository implements MasterRepository {
  private manifestPromise?: Promise<MasterManifest>;
  private allPromise?: Promise<MountainMaster[]>;

  constructor(private baseUrl = './master/') {}

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(this.baseUrl + path);
    if (!res.ok) throw new Error(`山名データを読み込めませんでした（${res.status}）`);
    return (await res.json()) as T;
  }

  loadManifest(): Promise<MasterManifest> {
    this.manifestPromise ??= this.fetchJson<MasterManifest>('manifest.json').catch((e) => {
      this.manifestPromise = undefined;
      throw e;
    });
    return this.manifestPromise;
  }

  loadAll(): Promise<MountainMaster[]> {
    this.allPromise ??= (async () => {
      const manifest = await this.loadManifest();
      const chunks = await Promise.all(manifest.chunks.map((c) => this.fetchJson<MasterChunkFile>(c.file)));
      return chunks.flatMap(rowsToMasters);
    })().catch((e) => {
      this.allPromise = undefined;
      throw e;
    });
    return this.allPromise;
  }
}

export class MemoryMasterRepository implements MasterRepository {
  constructor(
    private items: MountainMaster[],
    private manifest: MasterManifest,
  ) {}

  async loadManifest() {
    return this.manifest;
  }

  async loadAll() {
    return this.items;
  }
}
