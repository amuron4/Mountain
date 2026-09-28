/**
 * 山マスターの標高を国土地理院データから自動補完する
 *
 *   npm run master:elevation                # 公式山岳標高 → 標高タイル(DEM) の順に取得して反映
 *   npm run master:elevation -- --offline   # ネットワークに接続せず、キャッシュ済みタイルだけで再計算
 *   npm run master:elevation -- --no-official --interval=500
 *
 * 1. 国土地理院「日本の主な山岳標高」（公式の山頂標高）
 *    - data/raw/elevation/ に CSV / GeoJSON があればそれを使い、無ければ公式ページから CSV を1回だけ取得してキャッシュ
 *    - 山名位置から 150m 以内かつ山名・読みが一致したものだけ採用（名前だけでは突合しない。曖昧なら不採用）
 * 2. 公式に一致しない山は、山名位置の緯度経度から標高タイル（PNG）の画素値を読む
 *    - 精度の高い順に DEM1A(z17) → DEM5A → DEM5B → DEM5C(z15) → DEM10B(z14)
 *    - 必要なタイルを座標から計算し、同じタイルの山はまとめて1回だけ取得（data/raw/dem/ にキャッシュ）
 *    - 直列・最小間隔つきで取得し、サーバーへ過度なアクセスをしない
 * 3. 結果を scripts/master/elevations.json（コミット対象）に保存し、public/master/ を再生成する
 *    - 取得できなかった山は undefined のまま。推測値は入れない
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowsToMasters } from '../../src/data/masterRepository';
import type { MasterChunkFile, MasterManifest, MountainMaster } from '../../src/domain/master/types';
import { buildMaster, ELEVATIONS_PATH, ELEVATION_MATCH_MAX_M, ROOT } from './build';
import { DEM_SOURCES, resolveDemElevations, roundElevation } from './lib/dem';
import { matchElevations, parseElevationFile, type ElevationPoint } from './lib/elevation';
import { countBySource, ELEVATION_SOURCE_ORDER, readElevationStore, writeElevationStore, type ElevationStoreFile } from './lib/elevationStore';
import { findCsvLinks, OFFICIAL_PAGE_URL } from './lib/official';
import { TileFetcher } from './lib/tileFetcher';

const RAW_DIR = join(ROOT, 'data/raw');
/** 自動取得したファイルのキャッシュ（コミットしない） */
const OFFICIAL_DIR = join(RAW_DIR, 'elevation');
/** 手動でダウンロードした公式ファイルを置く場所（コミットできる。ネットワーク無しで突合できる） */
const OFFICIAL_COMMITTED_DIR = join(ROOT, 'data/official');
const DEM_CACHE = join(RAW_DIR, 'dem');
const USER_AGENT = 'yama-note-master-elevation/1.0 (+https://github.com/amuron4/Mountain; batch job, cached, rate-limited)';

interface Args {
  offline: boolean;
  official: boolean;
  dem: boolean;
  intervalMs: number;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const interval = Number(get('interval') ?? 300);
  if (!Number.isFinite(interval) || interval < 200) throw new Error('--interval は 200ms 以上にしてください（国土地理院サーバーへの負荷を抑えるため）');
  return {
    offline: argv.includes('--offline'),
    official: !argv.includes('--no-official'),
    dem: !argv.includes('--no-dem'),
    intervalMs: interval,
    limit: get('limit') ? Number(get('limit')) : undefined,
  };
}

function loadMasters(): MountainMaster[] {
  const dir = join(ROOT, 'public/master');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as MasterManifest;
  return manifest.chunks.flatMap((c) => rowsToMasters(JSON.parse(readFileSync(join(dir, c.file), 'utf8')) as MasterChunkFile));
}

const sha256 = (buf: Uint8Array) => createHash('sha256').update(buf).digest('hex');

/** 公式山岳標高ファイル: ローカルにあればそれ、無ければ公式ページから CSV を探して1回だけ取得 */
async function loadOfficial(args: Args): Promise<{ points: ElevationPoint[]; file?: string; sha?: string }> {
  const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(csv|geojson|json)$/i.test(f)).sort().map((f) => join(dir, f)) : []);
  const local = [...list(OFFICIAL_COMMITTED_DIR), ...list(OFFICIAL_DIR)];
  if (!local.length && !args.offline) {
    try {
      console.log(`公式山岳標高: ${OFFICIAL_PAGE_URL} から CSV のリンクを探します`);
      const page = await fetch(OFFICIAL_PAGE_URL, { headers: { 'User-Agent': USER_AGENT } });
      if (!page.ok) throw new Error(`HTTP ${page.status}`);
      const buf = new Uint8Array(await page.arrayBuffer());
      const html = new TextDecoder(/shift_jis/i.test(page.headers.get('content-type') ?? '') ? 'shift_jis' : 'utf-8').decode(buf);
      const link = findCsvLinks(html)[0];
      if (!link) throw new Error('ページ内に CSV へのリンクが見つかりません');
      await new Promise((r) => setTimeout(r, args.intervalMs));
      const res = await fetch(link.url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${link.url}`);
      const csv = new Uint8Array(await res.arrayBuffer());
      mkdirSync(OFFICIAL_DIR, { recursive: true });
      const name = decodeURIComponent(new URL(link.url).pathname.split('/').pop() ?? 'gsi-sangaku.csv');
      writeFileSync(join(OFFICIAL_DIR, name), csv);
      local.push(join(OFFICIAL_DIR, name));
      console.log(`  取得: ${link.text || name}（${(csv.length / 1024).toFixed(0)}KB）→ data/raw/elevation/${name}`);
    } catch (e) {
      console.warn(`  公式山岳標高を取得できませんでした（${(e as Error).message}）。DEM のみで補完します`);
    }
  }
  const points: ElevationPoint[] = [];
  const shas: string[] = [];
  const used: string[] = [];
  for (const path of local) {
    const buf = new Uint8Array(readFileSync(path));
    const name = path.slice(ROOT.length + 1);
    const { points: ps, skipped, hasCoordinates } = parseElevationFile(buf, path);
    if (!hasCoordinates) {
      console.warn(`  ⚠ ${name}: 緯度・経度の列が無いため使いません（名前だけでは突合しない）。座標付きの GeoJSON 版を使ってください`);
      continue;
    }
    console.log(`  公式山岳標高 ${name}: ${ps.length}地点（読めない行 ${skipped}）`);
    points.push(...ps);
    shas.push(sha256(buf));
    used.push(name);
  }
  if (used.length && points.length < 100) throw new Error('公式山岳標高ファイルの読み込み結果が少なすぎます。ファイル形式を確認してください');
  return { points, file: used.join(', ') || undefined, sha: shas.join(',') || undefined };
}

/** 代表的な山の検証（公表値との差が大きいものを警告する。公表値はこの検証表示にだけ使い、データには入れない） */
const CHECKS: { name: string; near: [number, number]; published: number }[] = [
  { name: '富士山', near: [35.3606, 138.7274], published: 3776 },
  { name: '槍ヶ岳', near: [36.342, 137.6477], published: 3180 },
  { name: '赤岳', near: [35.9709, 138.3702], published: 2899 },
  { name: '谷川岳', near: [36.8358, 138.9303], published: 1977 },
  { name: '武甲山', near: [35.9516, 139.0978], published: 1304 },
  { name: '高尾山', near: [35.6251, 139.2437], published: 599 },
  { name: '飯縄山', near: [36.7383, 138.1362], published: 1917 },
  { name: '雲取山', near: [35.8556, 138.9439], published: 2017 },
  { name: '蛭ヶ岳', near: [35.4863, 139.1389], published: 1673 },
  { name: '両神山', near: [36.0234, 138.8412], published: 1723 },
];

export function representativeReport(masters: MountainMaster[], items: ElevationStoreFile['items']) {
  const lines: string[] = [];
  let warnings = 0;
  for (const c of CHECKS) {
    const cand = masters
      .filter((m) => m.name === c.name)
      .map((m) => ({ m, d: Math.hypot((m.latitude - c.near[0]) * 111, (m.longitude - c.near[1]) * 90) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!cand || cand.d > 3) {
      lines.push(`  ${c.name}: 山マスターに見つかりません`);
      continue;
    }
    const v = items[cand.m.id];
    if (!v) {
      lines.push(`  ${c.name}: 標高なし（取得不能）`);
      continue;
    }
    const diff = v[0] - c.published;
    // 山名注記の位置は山頂から少しずれることがあるので DEM は低めに出やすい。大きく外れたものだけ警告
    const bad = v[1] === 'gsi-sangaku' ? Math.abs(diff) > 5 : diff > 15 || diff < -80;
    if (bad) warnings++;
    lines.push(`  ${c.name}: ${Math.round(v[0]).toLocaleString()}m（${v[1]}）公表値 ${c.published}m との差 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}m${bad ? '  ⚠ 要確認' : ''}`);
  }
  return { lines, warnings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let masters = loadMasters();
  if (args.limit) masters = masters.slice(0, args.limit);
  console.log(`山マスター: ${masters.length}座（${args.offline ? 'オフライン: キャッシュのみ使用' : `取得間隔 ${args.intervalMs}ms・直列`}）`);

  const items: ElevationStoreFile['items'] = {};
  const prev = readElevationStore(ELEVATIONS_PATH);
  let official: ElevationStoreFile['official'];

  // 1. 公式山岳標高
  if (args.official) {
    const o = await loadOfficial(args);
    if (o.points.length) {
      const m = matchElevations(
        o.points,
        masters.map((x) => ({ id: x.id, name: x.name, kana: x.kana, aliases: x.aliases ?? [], lat: x.latitude, lon: x.longitude })),
        { maxDistanceM: ELEVATION_MATCH_MAX_M },
      );
      for (const [id, e] of m.elevations) items[id] = [roundElevation(e), 'gsi-sangaku'];
      official = { file: o.file!, sha256: o.sha!, points: o.points.length };
      console.log(`  公式山岳標高と突合: 採用 ${m.matched} / 近傍に山名なし ${m.noCandidate} / 名称不一致で不採用 ${m.nameMismatch} / 曖昧で不採用 ${m.ambiguous}`);
    }
  }

  // 2. 標高タイル（DEM）
  if (args.dem) {
    const rest = masters.filter((m) => !items[m.id]).map((m) => ({ id: m.id, lat: m.latitude, lon: m.longitude }));
    console.log(`標高タイル: ${rest.length}座を ${DEM_SOURCES.map((s) => `${s.label}(z${s.zoom})`).join(' → ')} の順に補完`);
    const fetcher = new TileFetcher({ cacheDir: DEM_CACHE, minIntervalMs: args.intervalMs, offline: args.offline, userAgent: USER_AGENT });
    const { results, stats } = await resolveDemElevations(rest, fetcher.get, { onProgress: (msg) => console.log(`  ${msg}`) });
    for (const [id, r] of results) items[id] = [roundElevation(r.elevationM), r.source];
    console.log(
      `  タイル要求 ${stats.tilesRequested}（うち存在しない ${stats.tilesMissing}）/ ネットワーク取得 ${fetcher.stats.network}・キャッシュ ${fetcher.stats.cacheHits}` +
        `${fetcher.stats.skippedOffline ? `・オフラインで未取得 ${fetcher.stats.skippedOffline}` : ''} / 範囲外で不採用 ${stats.outOfRange}`,
    );
    if (args.offline && fetcher.stats.skippedOffline) console.warn('  ⚠ オフラインのためキャッシュに無いタイルは未取得です（その山は標高なし）');
  } else {
    // DEM を更新しない場合は前回の DEM 値を引き継ぐ
    for (const [id, v] of Object.entries(prev.items)) if (!items[id] && v[1] !== 'gsi-sangaku') items[id] = v;
  }

  // 3. 保存 → 山マスター再生成
  const by = countBySource(items);
  const total = masters.length;
  const store: ElevationStoreFile = {
    format: 1,
    updatedAt: new Date().toISOString(),
    official,
    stats: { total, ...by, unresolved: total - Object.keys(items).length },
    items,
  };
  if (args.limit) {
    console.log('\n--limit 指定のため elevations.json は更新しません（動作確認用）');
  } else {
    writeElevationStore(ELEVATIONS_PATH, store);
    console.log(`\n保存: ${ELEVATIONS_PATH}`);
    await buildMaster();
  }

  console.log('\n===== 標高の取得結果 =====');
  console.log(`全山数            ${total}`);
  const label: Record<string, string> = {
    'gsi-sangaku': '公式山岳標高',
    'gsi-dem1a': 'DEM1A',
    'gsi-dem5a': 'DEM5A',
    'gsi-dem5b': 'DEM5B',
    'gsi-dem5c': 'DEM5C',
    'gsi-dem10b': 'DEM10B',
  };
  for (const k of ELEVATION_SOURCE_ORDER) console.log(`${label[k].padEnd(12, ' ')}      ${by[k]}`);
  console.log(`標高取得不能      ${store.stats.unresolved}`);
  const report = representativeReport(masters, items);
  console.log('\n代表的な山（公表値は検証表示のみに使用）');
  for (const l of report.lines) console.log(l);
  if (report.warnings) console.warn(`⚠ 要確認 ${report.warnings}件`);
}

// npm run master:elevation として直接実行されたときだけ動かす（テストから関数を読み込んでも通信しない）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\n中断しました: ${(e as Error).message}`);
    console.error('取得済みのタイルは data/raw/dem/ にキャッシュされているので、再実行すると続きから処理します。');
    process.exit(1);
  });
}
