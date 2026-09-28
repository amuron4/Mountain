/**
 * 山マスター（検索・発見・登録用の読み取り専用データ）。
 *
 * - ユーザー自身のデータ（Mountain / ClimbRecord、IndexedDB）とは完全に分離する。
 * - ビルド時に scripts/master/build.ts が公開データから生成し、public/master/ に静的 JSON として置く。
 * - ユーザーが選んだ山だけが、既存の Mountain エンティティとして自分のデータへコピーされる。
 * - 将来、詳細な登山データ（コース・難易度など）を持つ MountainCatalog を別に追加できるよう、
 *   ここでは「名前・読み・位置・都道府県・（確実な場合のみ）標高」だけを扱う。
 */

export interface MountainMaster {
  /** データ更新後も可能な限り安定する決定的 ID（座標＋正規化山名から生成） */
  id: string;
  /** 表示用の山名（外字は代替文字ではなく正しい字形に置換済み） */
  name: string;
  /** 読み（ひらがな）。複数の読みがある場合は先頭 */
  kana: string;
  /** 検索用の別表記（別の読み・外字の代替表記など）。無ければ undefined */
  aliases?: string[];
  /** 標高。信頼できるデータと十分な確信で突合できた場合のみ。推測値は入れない */
  elevationM?: number;
  latitude: number;
  longitude: number;
  /** 所在都道府県。県境の山は複数（先頭が山頂点を含む都道府県） */
  prefectures: string[];
  /** 山域（出典データに無い場合は undefined） */
  range?: string;
  /** 出典キー（manifest.sources のキー） */
  source: string;
  /** 標高の出典キー（標高がある場合のみ） */
  elevationSource?: string;
}

export interface MasterSourceInfo {
  key: string;
  title: string;
  /** 出典表記（利用規約に従ったクレジット） */
  credit: string;
  url: string;
  license: string;
  /** どの版・コミットから生成したか */
  version: string;
  note?: string;
}

export interface MasterChunkRef {
  /** 都道府県名（この都道府県を「主な所在地」とする山を格納） */
  prefecture: string;
  /** JIS 都道府県コード */
  code: string;
  /** public/master/ からの相対パス（内容ハッシュ付き） */
  file: string;
  count: number;
}

export interface MasterManifest {
  format: 1;
  generatedAt: string;
  /** データ版（内容のハッシュ） */
  version: string;
  /** 対象都道府県（設定ファイル由来。都道府県フィルターの選択肢になる） */
  prefectures: string[];
  total: number;
  withElevation: number;
  chunks: MasterChunkRef[];
  sources: MasterSourceInfo[];
  /** 生成時の判定パラメータ（県境判定の許容距離など）。検証・説明用 */
  params: Record<string, number | string>;
}

/** チャンクファイルの形式（容量削減のため行は配列で持つ） */
export interface MasterChunkFile {
  format: 1;
  prefecture: string;
  /** 各行の列の意味 */
  fields: ['id', 'name', 'kana', 'lat', 'lon', 'prefectures', 'elevationM', 'aliases', 'range', 'elevationSource'];
  source: string;
  rows: MasterRow[];
}

export type MasterRow = [
  id: string,
  name: string,
  kana: string,
  lat: number,
  lon: number,
  /** 都道府県コード（"13" など）の配列 */
  prefectureCodes: string[],
  elevationM: number | null,
  aliases?: string[] | null,
  range?: string | null,
  elevationSource?: string | null,
];
