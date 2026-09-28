/**
 * 山マスター生成スクリプト
 *
 *   npm run master:build
 *
 * 元データ（コミット固定の公開データ）
 *   ↓ ダウンロード（data/raw/ にキャッシュ、SHA-256 を記録）
 *   ↓ 必要な項目だけ抽出（山名・読み・緯度経度）
 *   ↓ 緯度経度 → 都道府県判定（行政区域ポリゴン、県境は複数都県）
 *   ↓ 対象都道府県（scripts/master/targets.json）だけ抽出
 *   ↓ 正規化・重複除去・決定的 ID 付与
 *   ↓ （任意）標高データと座標優先で突合
 *   ↓ public/master/ に都道府県別チャンク＋manifest.json を出力
 *
 * 標高データ（国土地理院「日本の主な山岳標高」の CSV / GeoJSON）は利用規約上ダウンロードして使えるが、
 * 自動取得はせず data/raw/elevation/ に置かれた場合だけ使う（README 参照）。置かれていなければ標高は付けない。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFECTURES_JIS, prefectureCode } from '../../src/domain/geo';
import type { MasterChunkFile, MasterManifest, MasterRow, MasterSourceInfo } from '../../src/domain/master/types';
import { decodeText, parseCsvObjects } from './lib/csv';
import { matchElevations, parseElevationFile, type ElevationPoint } from './lib/elevation';
import { PrefectureLocator, type GeoJsonFeature } from './lib/prefecture';
import { dedupeSummits, masterId, toSummit } from './lib/summits';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RAW_DIR = join(ROOT, 'data/raw');
const OUT_DIR = join(ROOT, 'public/master');

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

/** 他県の境界までこの距離以内なら、その県も所在地に含める（簡略化ポリゴンの誤差も吸収） */
export const BORDER_TOLERANCE_M = 400;
/** 標高データと山マスターを突合する最大距離 */
export const ELEVATION_MATCH_MAX_M = 150;

const SUMMITS = {
  repo: 'anineco/GSI-VectorTile-MountainDB',
  commit: 'ec14a7641e19888fcc388ce1d418da530f3e68ee',
  path: 'gsi_summits.csv',
};

const BOUNDARIES = {
  repo: 'smartnews-smri/japan-topography',
  commit: 'b403e71eb97f1fdf32f63d16bd485129f703855e',
  path: (code: string) => `data/municipality/geojson/s0010/N03-21_${code}_210101.json`,
};

const SOURCES: MasterSourceInfo[] = [
  {
    key: 'gsi-vt',
    title: '山名・読み・位置: 国土地理院ベクトルタイル（注記）',
    credit: '国土地理院ベクトルタイル提供実験（注記データ）を加工して作成。抽出: anineco/GSI-VectorTile-MountainDB（MIT License）',
    url: `https://github.com/${SUMMITS.repo}`,
    license: '国土地理院コンテンツ利用規約（CC BY 4.0 互換）／抽出データ・スクリプト: MIT License (c) 2025 Nyanta Anineco',
    version: `${SUMMITS.repo}@${SUMMITS.commit.slice(0, 7)} ${SUMMITS.path}`,
  },
  {
    key: 'n03',
    title: '都道府県の判定: 国土数値情報（行政区域データ）',
    credit: '「国土数値情報（行政区域データ）」（国土交通省）をスマートニュース メディア研究所が加工したデータ（smartnews-smri/japan-topography）を加工して作成',
    url: `https://github.com/${BOUNDARIES.repo}`,
    license: '国土数値情報の利用規約に従う（出典の明記が必要）',
    version: `${BOUNDARIES.repo}@${BOUNDARIES.commit.slice(0, 7)} N03-21（令和3年）簡素化1%`,
    note: `県境から ${BORDER_TOLERANCE_M}m 以内の山は隣県も所在地に含める。境界は簡略化データのため、県境付近の判定は目安。`,
  },
];

// ---------------------------------------------------------------------------

function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchCached(repo: string, commit: string, path: string): Promise<Uint8Array> {
  const cachePath = join(RAW_DIR, repo.replace('/', '__'), commit, path);
  if (existsSync(cachePath)) return new Uint8Array(readFileSync(cachePath));
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, buf);
  console.log(`  downloaded ${repo}/${path} (${(buf.length / 1024).toFixed(0)}KB, sha256 ${sha256(buf).slice(0, 12)})`);
  return buf;
}

function loadTargets(): string[] {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'scripts/master/targets.json'), 'utf8')) as { prefectures: string[] };
  for (const p of cfg.prefectures) if (!prefectureCode(p)) throw new Error(`targets.json: 不明な都道府県名 ${p}`);
  return cfg.prefectures;
}

function loadElevationPoints(): { points: ElevationPoint[]; files: string[]; hashes: string[] } {
  const dir = join(RAW_DIR, 'elevation');
  if (!existsSync(dir)) return { points: [], files: [], hashes: [] };
  const files = readdirSync(dir).filter((f) => /\.(csv|geojson|json)$/i.test(f));
  const points: ElevationPoint[] = [];
  const hashes: string[] = [];
  for (const f of files) {
    const buf = new Uint8Array(readFileSync(join(dir, f)));
    const { points: ps, skipped } = parseElevationFile(buf, f);
    console.log(`  elevation source ${f}: ${ps.length} points (skipped ${skipped})`);
    points.push(...ps);
    hashes.push(sha256(buf).slice(0, 12));
  }
  return { points, files, hashes };
}

async function main() {
  const targets = loadTargets();
  const targetSet = new Set(targets);
  console.log(`対象: ${targets.length}都道府県`);

  // 1. 山名データ
  const summitsCsv = decodeText(await fetchCached(SUMMITS.repo, SUMMITS.commit, SUMMITS.path));
  const rawRows = parseCsvObjects(summitsCsv);
  const summits = rawRows.map(toSummit).filter((s) => !!s);
  console.log(`山名データ: ${rawRows.length}行 → 有効 ${summits.length}`);

  // 2. 行政区域（全国分を読み込む: 対象県の県境判定に隣県も必要なため）
  const locator = new PrefectureLocator(BORDER_TOLERANCE_M);
  for (let i = 0; i < PREFECTURES_JIS.length; i++) {
    const code = String(i + 1).padStart(2, '0');
    const buf = await fetchCached(BOUNDARIES.repo, BOUNDARIES.commit, BOUNDARIES.path(code));
    const geo = JSON.parse(new TextDecoder().decode(buf)) as { features: GeoJsonFeature[] };
    const name = String(geo.features[0]?.properties?.N03_001 ?? '');
    if (name !== PREFECTURES_JIS[i]) throw new Error(`境界データの都道府県名が一致しません: ${code} ${name}`);
    locator.addPrefecture(name, geo.features);
  }

  // 3. 都道府県判定 → 対象抽出
  let outside = 0;
  let approximated = 0;
  const located: (ReturnType<typeof toSummit> & object & { prefectures: string[] })[] = [];
  for (const s of summits) {
    const r = locator.locate(s.lat, s.lon);
    if (!r) {
      outside++;
      continue;
    }
    if (!r.all.some((p) => targetSet.has(p))) continue;
    if (r.approximated) approximated++;
    located.push({ ...s, prefectures: r.all });
  }
  const { rows: unique, removed } = dedupeSummits(located);
  console.log(`対象都道府県内: ${located.length}（重複注記 ${removed} を統合 → ${unique.length}）、判定不能 ${outside}、最寄り補完 ${approximated}`);

  // 4. ID
  const records = unique.map((s) => ({ ...s, id: masterId(s.name, s.lat, s.lon) }));
  const ids = new Set<string>();
  for (const r of records) {
    if (ids.has(r.id)) throw new Error(`ID が重複しました: ${r.id} ${r.name}`);
    ids.add(r.id);
  }

  // 4b. 人手による補正（出典を確認できたものだけ。既定では空）
  const overrides = JSON.parse(readFileSync(join(ROOT, 'scripts/master/overrides.json'), 'utf8')) as {
    prefectures: Record<string, { prefectures: string[]; reason: string; source: string }>;
  };
  for (const [id, o] of Object.entries(overrides.prefectures)) {
    const r = records.find((x) => x.id === id);
    if (!r) throw new Error(`overrides.json: 存在しない ID ${id}`);
    for (const p of o.prefectures) if (!prefectureCode(p)) throw new Error(`overrides.json: 不明な都道府県名 ${p}`);
    r.prefectures = o.prefectures;
  }
  if (Object.keys(overrides.prefectures).length) console.log(`都道府県の補正: ${Object.keys(overrides.prefectures).length}件`);

  // 5. 標高（任意）
  const elev = loadElevationPoints();
  const elevationKey = elev.files.length ? `gsi-sangaku` : undefined;
  let elevations = new Map<string, number>();
  if (elev.points.length) {
    const m = matchElevations(elev.points, records.map((r) => ({ id: r.id, name: r.name, kana: r.kana, aliases: r.aliases, lat: r.lat, lon: r.lon })), {
      maxDistanceM: ELEVATION_MATCH_MAX_M,
    });
    elevations = m.elevations;
    console.log(`標高突合: 採用 ${m.matched} / 近傍候補なし ${m.noCandidate} / 名称不一致で不採用 ${m.nameMismatch} / 曖昧で不採用 ${m.ambiguous}`);
    SOURCES.push({
      key: 'gsi-sangaku',
      title: '標高: 国土地理院「日本の主な山岳標高」',
      credit: '国土地理院「日本の主な山岳標高」を加工して作成',
      url: 'https://www.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html',
      license: '国土地理院コンテンツ利用規約（CC BY 4.0 互換）',
      version: `${elev.files.join(', ')} (sha256 ${elev.hashes.join(', ')})`,
      note: `山頂位置から ${ELEVATION_MATCH_MAX_M}m 以内かつ山名・読みが一致した場合のみ採用。一意に決まらないものは標高なし。`,
    });
  } else {
    console.log('標高データ: data/raw/elevation/ に無いため標高は付与しません（elevationM は undefined）');
  }

  // 6. 出力（主な所在地の都道府県ごと。主が対象外の県境の山は、対象県のうち最初の県へ）
  const byPref = new Map<string, MasterRow[]>();
  for (const r of records.sort((a, b) => a.kana.localeCompare(b.kana, 'ja') || a.lat - b.lat)) {
    const chunkPref = targetSet.has(r.prefectures[0]) ? r.prefectures[0] : r.prefectures.find((p) => targetSet.has(p))!;
    const e = elevations.get(r.id);
    const row: MasterRow = [r.id, r.name, r.kana, r.lat, r.lon, r.prefectures.map((p) => prefectureCode(p)!), e ?? null];
    const extra: [string[] | null, string | null, string | null] = [r.aliases.length ? r.aliases : null, null, e !== undefined ? elevationKey! : null];
    // 末尾の null は省略してサイズを抑える
    while (extra.length && extra[extra.length - 1] === null) extra.pop();
    (row as unknown[]).push(...extra);
    const list = byPref.get(chunkPref) ?? [];
    list.push(row);
    byPref.set(chunkPref, list);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const chunks = [];
  const versionHash = createHash('sha256');
  for (const pref of targets) {
    const rows = byPref.get(pref) ?? [];
    const chunk: MasterChunkFile = {
      format: 1,
      prefecture: pref,
      fields: ['id', 'name', 'kana', 'lat', 'lon', 'prefectures', 'elevationM', 'aliases', 'range', 'elevationSource'],
      source: 'gsi-vt',
      rows,
    };
    const json = JSON.stringify(chunk);
    const h = sha256(new TextEncoder().encode(json)).slice(0, 10);
    versionHash.update(h);
    const code = prefectureCode(pref)!;
    const file = `pref-${code}.${h}.json`;
    writeFileSync(join(OUT_DIR, file), json);
    chunks.push({ prefecture: pref, code, file, count: rows.length });
  }
  const total = chunks.reduce((a, c) => a + c.count, 0);
  const manifest: MasterManifest = {
    format: 1,
    generatedAt: new Date().toISOString(),
    version: versionHash.digest('hex').slice(0, 12),
    prefectures: targets,
    total,
    withElevation: elevations.size,
    chunks,
    sources: SOURCES,
    params: { borderToleranceM: BORDER_TOLERANCE_M, elevationMatchMaxM: ELEVATION_MATCH_MAX_M },
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 生成データに同梱する出典・ライセンス表記（元データの LICENSE はコミット固定で取得）
  const mitText = new TextDecoder().decode(await fetchCached(SUMMITS.repo, SUMMITS.commit, 'LICENSE')).trim();
  const notice = [
    '山ノート 山名データ（public/master/*.json）の出典・ライセンス',
    '',
    '本データは参考情報です。登山計画には必ず最新の公式地図・現地情報で再確認してください。',
    '',
    ...SOURCES.flatMap((src) => [`■ ${src.title}`, `  出典: ${src.credit}`, `  ライセンス: ${src.license}`, `  版: ${src.version}`, `  URL: ${src.url}`, ...(src.note ? [`  注記: ${src.note}`] : []), '']),
    `■ ${SUMMITS.repo} の LICENSE`,
    '',
    mitText,
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'NOTICE.txt'), notice);

  const bytes = readdirSync(OUT_DIR).reduce((a, f) => a + readFileSync(join(OUT_DIR, f)).length, 0);
  console.log(`\n出力: ${OUT_DIR}`);
  console.log(`総件数 ${total} / 標高あり ${elevations.size} / 標高不明 ${total - elevations.size} / 容量 ${(bytes / 1024).toFixed(0)}KB`);
  for (const c of chunks) console.log(`  ${c.prefecture.padEnd(4, '　')} ${String(c.count).padStart(5)}  ${c.file}`);
  const multi = records.filter((r) => r.prefectures.length > 1).length;
  console.log(`県境（複数都県）の山: ${multi}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
