/** 都道府県と地方の対応（地方は入力補助・絞り込み用） */
export const REGIONS: { name: string; prefectures: string[] }[] = [
  { name: '北海道', prefectures: ['北海道'] },
  { name: '東北', prefectures: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { name: '関東', prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { name: '甲信越', prefectures: ['山梨県', '長野県', '新潟県'] },
  { name: '北陸', prefectures: ['富山県', '石川県', '福井県'] },
  { name: '東海', prefectures: ['岐阜県', '静岡県', '愛知県', '三重県'] },
  { name: '近畿', prefectures: ['滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { name: '中国', prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { name: '四国', prefectures: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { name: '九州・沖縄', prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
];

export const PREFECTURES: string[] = REGIONS.flatMap((r) => r.prefectures);

export function regionOfPrefecture(pref: string): string | undefined {
  return REGIONS.find((r) => r.prefectures.includes(pref))?.name;
}

/** 入力補助用の代表的な山域 */
export const RANGE_SUGGESTIONS = [
  '丹沢', '奥多摩', '奥秩父', '高尾・陣馬', '箱根', '大菩薩', '道志', '秩父', '奥武蔵', '西上州', '日光', '尾瀬',
  '谷川', '上信越', '八ヶ岳', '北アルプス', '中央アルプス', '南アルプス', '富士山周辺', '御坂', '頸城', '妙高',
  '戸隠', '浅間', '美ヶ原', '霧ヶ峰', '奥多摩・大菩薩', '鈴鹿', '比良', '大峰', '六甲', '大山', '石鎚', '九重', '霧島', '屋久島',
];

/** JIS X 0401 の都道府県コード順（コード = 添字 + 1） */
export const PREFECTURES_JIS: string[] = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

export function prefectureCode(name: string): string | undefined {
  const i = PREFECTURES_JIS.indexOf(name);
  return i < 0 ? undefined : String(i + 1).padStart(2, '0');
}

export function prefectureByCode(code: string): string | undefined {
  return PREFECTURES_JIS[Number(code) - 1];
}
