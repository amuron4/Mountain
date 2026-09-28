/**
 * 山ノートのデータモデル。
 *
 * 設計方針:
 * - 「山（Mountain）」と「山行記録（ClimbRecord）」を分離する。1つの山に何回登っても記録は別々に残る。
 * - 数値（距離・累積標高・時間など）はタグにせず数値フィールドで持つ。
 * - 特徴はカテゴリ（TagCategory）とタグ（Tag）で表現する。どちらもデータとして保存されるため、
 *   コードを変更せずにユーザーが追加・編集・削除でき、プリセットも後から増やせる。
 * - 全エンティティが id / createdAt / updatedAt を持ち、将来のクラウド同期（更新日時ベースのマージ）に備える。
 * - 外部API連携用に location / photos / ext などの拡張フィールドを予約しておく。
 */

export type ID = string;
/** ISO8601 文字列 */
export type Timestamp = string;
/** YYYY-MM-DD */
export type DateString = string;

export interface Entity {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** 将来の外部連携・プラグイン用の自由領域（天気API のキャッシュ等） */
  ext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 評価
// ---------------------------------------------------------------------------

export type RatingKey = 'stamina' | 'technical' | 'fear' | 'scenery' | 'fun' | 'revisit' | 'affinity';
/** 1〜5。未評価はキー自体を持たない */
export type Ratings = Partial<Record<RatingKey, number>>;

// ---------------------------------------------------------------------------
// タグ
// ---------------------------------------------------------------------------

export type TagScope = 'mountain' | 'record';

export interface TagCategory extends Entity {
  name: string;
  description?: string;
  /** 表示順 */
  order: number;
  /** プリセット由来か（プリセットでもユーザーが名前変更・非表示にできる） */
  builtin: boolean;
  /** 非表示にしたカテゴリ（削除されたプリセットの再追加を防ぐためにも使う） */
  hidden?: boolean;
  /** アイコン用の絵文字など */
  icon?: string;
}

export interface Tag extends Entity {
  categoryId: ID;
  label: string;
  order: number;
  builtin: boolean;
  hidden?: boolean;
  /** 検索用の別名（例: 「温泉」に「日帰り湯」） */
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// 山
// ---------------------------------------------------------------------------

export type MountainStatus = 'unclimbed' | 'climbed' | 'revisit';

/** 代表コースなど、計画・参考用のコース情報（実際に歩いた記録は ClimbRecord） */
export interface Course {
  id: ID;
  name: string;
  start?: string;
  goal?: string;
  distanceKm?: number;
  ascentM?: number;
  descentM?: number;
  /** 標準コースタイム（分） */
  courseTimeMin?: number;
  note?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** 写真の参照（初期版では未使用。将来 IndexedDB の Blob ストアや外部ストレージを指す） */
export interface PhotoRef {
  id: ID;
  /** 'idb' = 端末内Blob, 'url' = 外部URL */
  storage: 'idb' | 'url';
  ref: string;
  caption?: string;
  takenAt?: Timestamp;
}

export interface LinkRef {
  label: string;
  url: string;
}

export interface Mountain extends Entity {
  name: string;
  kana: string;
  /** 地方（関東・甲信越 など） */
  region: string;
  /** 県境の山もあるため複数 */
  prefectures: string[];
  elevationM?: number;
  /** 山域（丹沢、奥秩父、北アルプス など） */
  range: string;
  status: MountainStatus;
  favorite: boolean;
  /** 行きたい度 0〜3（0 = 特になし、3 = 次に絶対行きたい） */
  wish: number;
  tagIds: ID[];
  /** 先頭が代表コース */
  courses: Course[];
  /** 自宅からの片道アクセス時間の目安（分） */
  accessMinutes?: number;
  accessNote?: string;
  /** 山としての総合評価（未踏なら予想値）。未設定の項目は山行記録の平均で補う */
  ratings: Ratings;
  memo: string;
  links: LinkRef[];
  photos: PhotoRef[];
  /** 位置（山マスターから登録した場合は山頂の緯度経度。将来の地図API用） */
  location?: GeoPoint;
  /**
   * 登録元の山マスター ID（山マスターから登録した場合のみ）。
   * 任意項目なので既存データのマイグレーションは不要。重複登録の判定に使う。
   */
  masterId?: string;
}

// ---------------------------------------------------------------------------
// 山行記録
// ---------------------------------------------------------------------------

export interface ClimbRecord extends Entity {
  /** 登った山。縦走で複数の山に登った場合は複数。先頭がメインの山 */
  mountainIds: ID[];
  date: DateString;
  /** 山小屋泊など複数日の場合の最終日 */
  endDate?: DateString;
  /** 山頂に到達したか（撤退記録も残せるように） */
  summitReached: boolean;
  courseName: string;
  start: string;
  goal: string;
  distanceKm?: number;
  ascentM?: number;
  descentM?: number;
  /** 実際の所要時間（分、休憩込み） */
  durationMin?: number;
  /** 標準コースタイム（分） */
  courseTimeMin?: number;
  weather: string;
  temperatureC?: number;
  trailCondition: string;
  crowd: string;
  transport: string[];
  gear: string;
  companions: string;
  impressions: string;
  ratings: Ratings;
  /** この山行固有の特徴タグ（山のタグと合わせて検索対象になる） */
  tagIds: ID[];
  photos: PhotoRef[];
  /** 将来の GPS ログ用 */
  track?: { format: 'gpx' | 'geojson'; ref: string };
}

// ---------------------------------------------------------------------------
// 設定・データセット
// ---------------------------------------------------------------------------

export type ThemeSetting = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemeSetting;
  /** 「近場」とみなす片道アクセス時間（分） */
  nearbyMinutes: number;
  /** 自宅エリア（表示用メモ） */
  homeArea: string;
  /** 自動バックアップ（端末内スナップショット）を取るか */
  autoBackup: boolean;
  lastExportAt?: Timestamp;
  lastAutoBackupAt?: Timestamp;
}

export interface Dataset {
  mountains: Mountain[];
  records: ClimbRecord[];
  tagCategories: TagCategory[];
  tags: Tag[];
  settings: Settings;
}

/** 永続化層に渡す変更セット。すべて1トランザクションで適用される */
export interface ChangeSet {
  put?: {
    mountains?: Mountain[];
    records?: ClimbRecord[];
    tagCategories?: TagCategory[];
    tags?: Tag[];
  };
  delete?: {
    mountains?: ID[];
    records?: ID[];
    tagCategories?: ID[];
    tags?: ID[];
  };
  settings?: Settings;
}

export interface BackupSnapshot {
  id: ID;
  createdAt: Timestamp;
  reason: 'auto' | 'manual' | 'before-import' | 'before-reset';
  summary: { mountains: number; records: number; tags: number };
  /** エクスポート形式と同じ JSON 文字列 */
  payload: string;
}
