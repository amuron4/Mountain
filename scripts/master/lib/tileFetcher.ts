/**
 * 国土地理院タイルの取得（ビルド時のみ）。サーバーへ過度な負荷をかけないための仕組み:
 * - 1リクエストずつ直列で取得し、リクエスト間に最小間隔（既定 300ms ≒ 最大 3.3 リクエスト/秒）を空ける
 * - 取得したタイルは data/raw/dem/ にキャッシュし、存在しないタイル（404）も記録して二度と要求しない
 * - 429 / 5xx は指数バックオフで数回だけ再試行し、連続して失敗したら処理を中断する（叩き続けない）
 * - offline モードではキャッシュだけを使い、ネットワークに一切アクセスしない
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEM_TILE_BASE, type TileProvider } from './dem';

export interface TileFetcherOptions {
  cacheDir: string;
  minIntervalMs?: number;
  offline?: boolean;
  maxRetries?: number;
  /** この回数連続でサーバーエラー・通信エラーになったら中断 */
  maxConsecutiveErrors?: number;
  userAgent?: string;
  /** テスト用に差し替え可能 */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface TileFetcherStats {
  cacheHits: number;
  network: number;
  notFound: number;
  retries: number;
  /** offline でキャッシュが無く取得しなかった数 */
  skippedOffline: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TileFetcher {
  readonly stats: TileFetcherStats = { cacheHits: 0, network: 0, notFound: 0, retries: 0, skippedOffline: 0 };
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private consecutiveErrors = 0;
  private opts: Required<Omit<TileFetcherOptions, 'fetchImpl' | 'sleep' | 'now' | 'userAgent'>> & Pick<TileFetcherOptions, 'userAgent'>;
  private fetchImpl: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;

  constructor(o: TileFetcherOptions) {
    this.opts = {
      cacheDir: o.cacheDir,
      minIntervalMs: o.minIntervalMs ?? 300,
      offline: o.offline ?? false,
      maxRetries: o.maxRetries ?? 3,
      maxConsecutiveErrors: o.maxConsecutiveErrors ?? 5,
      userAgent: o.userAgent,
    };
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? defaultSleep;
    this.now = o.now ?? Date.now;
  }

  private paths(tileset: string, z: number, x: number, y: number) {
    const base = join(this.opts.cacheDir, tileset, String(z), String(x), String(y));
    return { png: `${base}.png`, missing: `${base}.missing` };
  }

  /** キャッシュ優先でタイルを返す。存在しなければ undefined */
  readonly get: TileProvider = async (tileset, z, x, y) => {
    const p = this.paths(tileset, z, x, y);
    if (existsSync(p.png)) {
      this.stats.cacheHits++;
      return new Uint8Array(readFileSync(p.png));
    }
    if (existsSync(p.missing)) {
      this.stats.cacheHits++;
      return undefined;
    }
    if (this.opts.offline) {
      this.stats.skippedOffline++;
      return undefined;
    }
    const url = `${DEM_TILE_BASE}/${tileset}/${z}/${x}/${y}.png`;
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      let status = 0;
      try {
        const res = await this.fetchImpl(url, { headers: this.opts.userAgent ? { 'User-Agent': this.opts.userAgent } : undefined });
        this.stats.network++;
        status = res.status;
        if (res.status === 200) {
          const buf = new Uint8Array(await res.arrayBuffer());
          this.write(p.png, buf);
          this.consecutiveErrors = 0;
          return buf;
        }
        if (res.status === 404 || res.status === 204) {
          this.stats.notFound++;
          this.write(p.missing, new Uint8Array());
          this.consecutiveErrors = 0;
          return undefined;
        }
      } catch {
        status = -1; // 通信エラー
      }
      // 403 など: 再試行せず中断（アクセスを続けない）
      const retryable = status === -1 || status === 429 || status >= 500;
      if (!retryable) throw new Error(`タイル取得に失敗しました（HTTP ${status}）: ${url}`);
      if (++this.consecutiveErrors >= this.opts.maxConsecutiveErrors) {
        throw new Error(`連続して ${this.consecutiveErrors} 回失敗したため中断しました（最後: HTTP ${status} ${url}）`);
      }
      if (attempt >= this.opts.maxRetries) throw new Error(`再試行しても取得できませんでした（HTTP ${status}）: ${url}`);
      this.stats.retries++;
      await this.sleep(Math.min(60_000, 2000 * 2 ** attempt));
    }
  };

  private async throttle() {
    const wait = this.lastRequestAt + this.opts.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }

  private write(path: string, buf: Uint8Array) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
  }
}
