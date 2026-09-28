/**
 * 取得済み標高の保存（scripts/master/elevations.json、リポジトリにコミットする）。
 *
 * npm run master:elevation だけが国土地理院へアクセスしてこのファイルを更新する。
 * npm run master:build / アプリのビルド / GitHub Pages のデプロイは、このファイルを読むだけで通信しない。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { DemKey } from './dem';

export type ElevationSourceKey = 'gsi-sangaku' | DemKey;

export interface ElevationStoreFile {
  format: 1;
  updatedAt: string;
  /** 公式山岳標高データの版（ファイル名・SHA-256） */
  official?: { file: string; sha256: string; points: number };
  /** 集計（報告・検証用） */
  stats: Record<string, number>;
  /** master id → [標高(m), 出典キー] */
  items: Record<string, [number, ElevationSourceKey]>;
}

export const ELEVATION_SOURCE_INFO: Record<ElevationSourceKey, { title: string; credit: string; note: string }> = {
  'gsi-sangaku': {
    title: '標高: 国土地理院「日本の主な山岳標高」',
    credit: '国土地理院「日本の主な山岳標高」を加工して作成',
    note: '公表されている山頂の標高。山名位置から150m以内かつ山名・読みが一致した場合のみ採用。',
  },
  'gsi-dem1a': {
    title: '標高: 国土地理院 標高タイル（DEM1A）',
    credit: '国土地理院 標高タイル（基盤地図情報数値標高モデル 1mメッシュ DEM1A）を加工して作成',
    note: '山名注記の位置の地形の標高（1mメッシュ）。公表されている山頂標高と異なる場合がある。',
  },
  'gsi-dem5a': {
    title: '標高: 国土地理院 標高タイル（DEM5A）',
    credit: '国土地理院 標高タイル（基盤地図情報数値標高モデル 5mメッシュ DEM5A）を加工して作成',
    note: '山名注記の位置の地形の標高（5mメッシュ、航空レーザ測量）。公表されている山頂標高と異なる場合がある。',
  },
  'gsi-dem5b': {
    title: '標高: 国土地理院 標高タイル（DEM5B）',
    credit: '国土地理院 標高タイル（基盤地図情報数値標高モデル 5mメッシュ DEM5B）を加工して作成',
    note: '山名注記の位置の地形の標高（5mメッシュ、写真測量）。公表されている山頂標高と異なる場合がある。',
  },
  'gsi-dem5c': {
    title: '標高: 国土地理院 標高タイル（DEM5C）',
    credit: '国土地理院 標高タイル（基盤地図情報数値標高モデル 5mメッシュ DEM5C）を加工して作成',
    note: '山名注記の位置の地形の標高（5mメッシュ、写真測量・補間）。公表されている山頂標高と異なる場合がある。',
  },
  'gsi-dem10b': {
    title: '標高: 国土地理院 標高タイル（DEM10B）',
    credit: '国土地理院 標高タイル（基盤地図情報数値標高モデル 10mメッシュ DEM10B）を加工して作成',
    note: '山名注記の位置の地形の標高（10mメッシュ、等高線から作成）。公表されている山頂標高と異なる場合がある。',
  },
};

export const ELEVATION_SOURCE_ORDER: ElevationSourceKey[] = ['gsi-sangaku', 'gsi-dem1a', 'gsi-dem5a', 'gsi-dem5b', 'gsi-dem5c', 'gsi-dem10b'];

export function emptyStore(): ElevationStoreFile {
  return { format: 1, updatedAt: new Date(0).toISOString(), stats: {}, items: {} };
}

export function readElevationStore(path: string): ElevationStoreFile {
  if (!existsSync(path)) return emptyStore();
  const json = JSON.parse(readFileSync(path, 'utf8')) as ElevationStoreFile;
  if (json.format !== 1 || typeof json.items !== 'object') throw new Error(`${path}: 形式が不正です`);
  for (const [id, v] of Object.entries(json.items)) {
    if (!Array.isArray(v) || typeof v[0] !== 'number' || !ELEVATION_SOURCE_ORDER.includes(v[1])) throw new Error(`${path}: ${id} の値が不正です`);
  }
  return json;
}

/** キー順を固定して書き出す（差分を読みやすくするため） */
export function writeElevationStore(path: string, store: ElevationStoreFile) {
  const items: ElevationStoreFile['items'] = {};
  for (const id of Object.keys(store.items).sort()) items[id] = store.items[id];
  writeFileSync(path, JSON.stringify({ ...store, items }, null, 0).replace(/\],"/g, '],\n"').replace('"items":{', '"items":{\n') + '\n');
}

export function countBySource(items: ElevationStoreFile['items']): Record<ElevationSourceKey, number> {
  const out = Object.fromEntries(ELEVATION_SOURCE_ORDER.map((k) => [k, 0])) as Record<ElevationSourceKey, number>;
  for (const [, [, src]] of Object.entries(items)) out[src]++;
  return out;
}
