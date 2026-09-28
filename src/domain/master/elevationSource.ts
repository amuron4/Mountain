/**
 * 山マスターの標高の出典（UI 表示用）。
 * 公式の山頂標高（gsi-sangaku）と、数値標高モデル（DEM）から読んだ山名位置の地形の標高を区別する。
 */
export interface ElevationSourceLabel {
  /** 一覧に付ける短いラベル（公式は付けない） */
  short?: string;
  /** 説明文 */
  description: string;
  official: boolean;
}

const LABELS: Record<string, ElevationSourceLabel> = {
  'gsi-sangaku': { description: '国土地理院「日本の主な山岳標高」の公表値', official: true },
  'gsi-dem1a': { short: 'DEM1A', description: '国土地理院の数値標高モデル（1mメッシュ）による山名位置の地形の標高', official: false },
  'gsi-dem5a': { short: 'DEM5A', description: '国土地理院の数値標高モデル（5mメッシュ・航空レーザ）による山名位置の地形の標高', official: false },
  'gsi-dem5b': { short: 'DEM5B', description: '国土地理院の数値標高モデル（5mメッシュ・写真測量）による山名位置の地形の標高', official: false },
  'gsi-dem5c': { short: 'DEM5C', description: '国土地理院の数値標高モデル（5mメッシュ）による山名位置の地形の標高', official: false },
  'gsi-dem10b': { short: 'DEM10B', description: '国土地理院の数値標高モデル（10mメッシュ）による山名位置の地形の標高', official: false },
};

export function elevationSourceLabel(key: string | undefined): ElevationSourceLabel | undefined {
  return key ? LABELS[key] ?? { short: key, description: key, official: false } : undefined;
}

/** 通常は整数 m で表示する */
export function formatElevationM(v: number): string {
  return `${Math.round(v).toLocaleString('ja-JP')}m`;
}

export const DEM_NOTE = 'DEM の値は山名の位置の地形の標高で、公表されている山頂標高と異なる場合があります。';
