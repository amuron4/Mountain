/**
 * 動作確認・使い方の把握用サンプルデータ。
 * 数値（距離・累積標高・コースタイム・アクセス時間）は一般的なコースの「目安」であり、
 * 実際の計画には最新の地図・公式情報を確認すること。ext.sample = true で識別し、一括削除できる。
 */
import { createCourse, createMountain } from '../domain/mountain';
import { createRecord } from '../domain/record';
import type { ClimbRecord, Mountain, MountainStatus, Ratings } from '../domain/types';

interface SampleCourse {
  name: string;
  start: string;
  goal: string;
  km: number;
  up: number;
  down: number;
  ct: number;
}

interface SampleMountain {
  key: string;
  name: string;
  kana: string;
  region: string;
  prefs: string[];
  elev: number;
  range: string;
  status: MountainStatus;
  wish?: number;
  fav?: boolean;
  access: number;
  course: SampleCourse;
  tags: string[];
  ratings?: Ratings;
  memo?: string;
}

const h = (hours: number, min = 0) => hours * 60 + min;

const SAMPLES: SampleMountain[] = [
  {
    key: 'takao', name: '高尾山', kana: 'たかおさん', region: '関東', prefs: ['東京都'], elev: 599, range: '高尾・陣馬', status: 'climbed', fav: true, access: 60,
    course: { name: '稲荷山コース〜6号路周回', start: '高尾山口駅', goal: '高尾山口駅', km: 7.5, up: 560, down: 560, ct: h(3, 10) },
    tags: ['terrain.ridge', 'terrain.forest', 'terrain.stream', 'scenery.fuji', 'style.loop', 'style.station2station', 'style.cablecar', 'style.dayhike', 'season.allyear', 'stamina.light', 'difficulty.hiking', 'access.walkfromstation', 'access.public', 'facility.toilet', 'facility.restaurant', 'facility.shop', 'after.onsen', 'after.soba', 'crowd.crowded', 'feature.low', 'feature.satoyama', 'preference.beginnerfriendly'],
    memo: '（サンプル）ホームの山。数値は目安。',
  },
  {
    key: 'oyama', name: '大山', kana: 'おおやま', region: '関東', prefs: ['神奈川県'], elev: 1252, range: '丹沢', status: 'climbed', access: 90,
    course: { name: '表参道〜見晴台周回', start: '大山ケーブルバス停', goal: '大山ケーブルバス停', km: 7.0, up: 950, down: 950, ct: h(4, 20) },
    tags: ['terrain.stairs', 'terrain.forest', 'scenery.sea', 'scenery.nightview', 'scenery.autumn', 'style.loop', 'style.cablecar', 'style.dayhike', 'season.autumn', 'season.allyear', 'stamina.normal', 'technical.steepup', 'difficulty.general', 'access.bus', 'access.public', 'facility.toilet', 'facility.restaurant', 'after.onsen', 'crowd.popular', 'feature.low', 'title.nihyaku'],
  },
  {
    key: 'hiru', name: '蛭ヶ岳', kana: 'ひるがたけ', region: '関東', prefs: ['神奈川県'], elev: 1673, range: '丹沢', status: 'climbed', wish: 0, fav: true, access: 100,
    course: { name: '大倉〜塔ノ岳〜蛭ヶ岳（山荘泊）往復', start: '大倉バス停', goal: '大倉バス停', km: 23.0, up: 2150, down: 2150, ct: h(12, 30) },
    tags: ['terrain.ridge', 'terrain.skyline', 'terrain.stairs', 'terrain.boardwalk', 'scenery.fuji', 'scenery.mountains', 'scenery.cloudsea', 'scenery.sunrise', 'style.outandback', 'style.hut', 'season.autumn', 'season.spring', 'stamina.long', 'stamina.bigascent', 'difficulty.general', 'access.bus', 'access.public', 'facility.hut', 'danger.leech', 'danger.bear', 'crowd.normal', 'feature.range', 'title.prefhighest', 'title.sanbyaku', 'preference.ridgewalk', 'preference.hearty', 'preference.achievement'],
  },
  {
    key: 'ryokami', name: '両神山', kana: 'りょうかみさん', region: '関東', prefs: ['埼玉県'], elev: 1723, range: '秩父', status: 'climbed', access: 150,
    course: { name: '日向大谷口往復', start: '日向大谷口', goal: '日向大谷口', km: 11.0, up: 1150, down: 1150, ct: h(6, 10) },
    tags: ['terrain.stream', 'terrain.rockridge', 'terrain.forest', 'technical.chain', 'technical.steepup', 'technical.threepoint', 'scenery.mountains', 'scenery.flowers', 'style.outandback', 'style.dayhike', 'season.spring', 'season.autumn', 'stamina.solid', 'difficulty.caution', 'difficulty.rocky', 'access.car', 'access.parking', 'access.fewbus', 'danger.fall', 'danger.bear', 'danger.tick', 'crowd.few', 'feature.rockpeak', 'title.hyaku', 'preference.adventure'],
  },
  {
    key: 'iizuna', name: '飯縄山', kana: 'いいづなやま', region: '甲信越', prefs: ['長野県'], elev: 1917, range: '戸隠', status: 'climbed', access: 180,
    course: { name: '一の鳥居苑地往復', start: '一の鳥居苑地', goal: '一の鳥居苑地', km: 7.5, up: 850, down: 850, ct: h(4, 30) },
    tags: ['terrain.forest', 'terrain.ridge', 'scenery.alps', 'scenery.panorama', 'scenery.mountains', 'style.outandback', 'style.dayhike', 'season.summer', 'season.autumn', 'stamina.normal', 'difficulty.general', 'access.car', 'access.parking', 'danger.bear', 'crowd.normal', 'feature.volcano', 'after.soba', 'after.onsen', 'preference.view'],
  },
  {
    key: 'kintoki', name: '金時山', kana: 'きんときやま', region: '関東', prefs: ['神奈川県', '静岡県'], elev: 1212, range: '箱根', status: 'revisit', wish: 1, access: 110,
    course: { name: '公時神社〜金時山〜矢倉沢峠周回', start: '金時登山口バス停', goal: '金時登山口バス停', km: 5.0, up: 600, down: 600, ct: h(2, 40) },
    tags: ['terrain.forest', 'terrain.rocky', 'scenery.fuji', 'scenery.lake', 'style.loop', 'style.dayhike', 'season.winter', 'season.allyear', 'stamina.light', 'difficulty.general', 'access.bus', 'access.public', 'facility.restaurant', 'after.onsen', 'crowd.popular', 'feature.lavadome', 'preference.view', 'preference.beginnerfriendly'],
  },
  {
    key: 'izugatake', name: '伊豆ヶ岳', kana: 'いずがたけ', region: '関東', prefs: ['埼玉県'], elev: 851, range: '奥武蔵', status: 'climbed', access: 80,
    course: { name: '正丸駅〜伊豆ヶ岳〜子ノ権現〜吾野駅', start: '正丸駅', goal: '吾野駅', km: 13.0, up: 1050, down: 1150, ct: h(5, 30) },
    tags: ['terrain.ridge', 'terrain.forest', 'terrain.rocky', 'technical.chain', 'technical.steepup', 'style.traverse', 'style.station2station', 'style.dayhike', 'season.allyear', 'stamina.solid', 'difficulty.caution', 'access.walkfromstation', 'access.public', 'crowd.few', 'feature.low', 'preference.ridgewalk', 'preference.quiet'],
  },
  {
    key: 'kumotori', name: '雲取山', kana: 'くもとりやま', region: '関東', prefs: ['東京都', '埼玉県', '山梨県'], elev: 2017, range: '奥多摩', status: 'unclimbed', wish: 3, access: 150,
    course: { name: '鴨沢往復', start: '鴨沢バス停', goal: '鴨沢バス停', km: 21.0, up: 1500, down: 1500, ct: h(9, 30) },
    tags: ['terrain.ridge', 'terrain.skyline', 'terrain.forest', 'scenery.fuji', 'scenery.mountains', 'scenery.sunrise', 'style.outandback', 'style.hut', 'season.autumn', 'season.spring', 'stamina.long', 'stamina.bigascent', 'difficulty.general', 'access.bus', 'access.public', 'access.fewbus', 'facility.hut', 'facility.shelter', 'facility.water', 'danger.bear', 'crowd.normal', 'title.hyaku', 'title.prefhighest', 'preference.ridgewalk'],
    ratings: { stamina: 4, technical: 2, fear: 1 },
    memo: '（サンプル）東京都最高峰。山小屋泊も検討。',
  },
  {
    key: 'mizugaki', name: '瑞牆山', kana: 'みずがきやま', region: '甲信越', prefs: ['山梨県'], elev: 2230, range: '奥秩父', status: 'unclimbed', wish: 2, access: 180,
    course: { name: '瑞牆山荘往復', start: '瑞牆山荘', goal: '瑞牆山荘', km: 7.5, up: 800, down: 800, ct: h(4, 40) },
    tags: ['terrain.rocky', 'terrain.forest', 'terrain.stream', 'technical.ladder', 'technical.rope', 'technical.threepoint', 'technical.steepup', 'scenery.fuji', 'scenery.oddrock', 'scenery.autumn', 'scenery.mountains', 'style.outandback', 'style.dayhike', 'season.autumn', 'season.summer', 'stamina.normal', 'difficulty.rocky', 'access.car', 'access.parking', 'access.seasonalbus', 'danger.fall', 'danger.bear', 'crowd.popular', 'feature.rockpeak', 'title.hyaku', 'preference.adventure'],
    ratings: { stamina: 3, technical: 3, fear: 2 },
  },
  {
    key: 'tanigawa', name: '谷川岳', kana: 'たにがわだけ', region: '関東', prefs: ['群馬県', '新潟県'], elev: 1977, range: '谷川', status: 'unclimbed', wish: 2, access: 150,
    course: { name: '天神尾根往復（ロープウェイ利用）', start: '天神平駅', goal: '天神平駅', km: 7.0, up: 800, down: 800, ct: h(4, 30) },
    tags: ['terrain.ridge', 'terrain.skyline', 'terrain.rocky', 'terrain.meadow', 'technical.chain', 'scenery.mountains', 'scenery.cloudsea', 'scenery.autumn', 'scenery.flowers', 'style.outandback', 'style.ropeway', 'style.dayhike', 'season.summer', 'season.autumn', 'stamina.normal', 'difficulty.caution', 'access.bus', 'access.public', 'facility.hut', 'facility.toilet', 'after.onsen', 'danger.wind', 'danger.thunder', 'danger.fall', 'crowd.crowded', 'feature.range', 'title.hyaku', 'title.hana', 'preference.ridgewalk', 'preference.view'],
    ratings: { stamina: 3, technical: 3, fear: 3 },
  },
  {
    key: 'kawanori', name: '川苔山', kana: 'かわのりやま', region: '関東', prefs: ['東京都'], elev: 1363, range: '奥多摩', status: 'unclimbed', wish: 2, access: 110,
    course: { name: '川乗橋〜百尋ノ滝〜川苔山〜鳩ノ巣駅', start: '川乗橋バス停', goal: '鳩ノ巣駅', km: 13.0, up: 1100, down: 1200, ct: h(6, 0) },
    tags: ['terrain.stream', 'terrain.gorge', 'terrain.forest', 'technical.traverse', 'technical.crossing', 'scenery.waterfall', 'scenery.brook', 'scenery.greenery', 'style.bus2station', 'style.dayhike', 'season.spring', 'season.summer', 'stamina.solid', 'stamina.bigascent', 'difficulty.general', 'access.bus', 'access.public', 'after.onsen', 'danger.fall', 'danger.bear', 'crowd.normal', 'preference.hearty'],
    ratings: { stamina: 4, technical: 2, fear: 2 },
  },
  {
    key: 'bonoore', name: '棒ノ折山', kana: 'ぼうのおれやま', region: '関東', prefs: ['埼玉県', '東京都'], elev: 969, range: '奥武蔵', status: 'unclimbed', wish: 1, access: 100,
    course: { name: 'さわらびの湯〜白谷沢〜棒ノ折山往復', start: 'さわらびの湯バス停', goal: 'さわらびの湯バス停', km: 8.0, up: 750, down: 750, ct: h(4, 10) },
    tags: ['terrain.stream', 'terrain.gorge', 'terrain.rocky', 'technical.chain', 'scenery.waterfall', 'scenery.brook', 'scenery.mountains', 'style.outandback', 'style.dayhike', 'season.summer', 'season.spring', 'stamina.normal', 'difficulty.caution', 'access.bus', 'access.public', 'after.onsen', 'danger.leech', 'danger.fall', 'crowd.popular', 'feature.low', 'preference.adventure'],
    ratings: { stamina: 2, technical: 2, fear: 2 },
  },
  {
    key: 'kobushi', name: '甲武信ヶ岳', kana: 'こぶしがたけ', region: '甲信越', prefs: ['山梨県', '埼玉県', '長野県'], elev: 2475, range: '奥秩父', status: 'unclimbed', wish: 1, access: 170,
    course: { name: '西沢渓谷〜徳ちゃん新道往復', start: '西沢渓谷入口', goal: '西沢渓谷入口', km: 15.0, up: 1400, down: 1400, ct: h(9, 0) },
    tags: ['terrain.forest', 'terrain.ridge', 'technical.steepup', 'scenery.mountains', 'scenery.fuji', 'style.outandback', 'style.hut', 'season.summer', 'season.autumn', 'stamina.long', 'stamina.bigascent', 'stamina.steep', 'difficulty.general', 'access.bus', 'access.car', 'access.fewbus', 'facility.hut', 'danger.bear', 'crowd.quiet', 'title.hyaku', 'preference.quiet', 'preference.hearty'],
    ratings: { stamina: 5, technical: 2, fear: 1 },
  },
  {
    key: 'akadake', name: '赤岳', kana: 'あかだけ', region: '甲信越', prefs: ['長野県', '山梨県'], elev: 2899, range: '八ヶ岳', status: 'unclimbed', wish: 3, access: 180,
    course: { name: '美濃戸口〜文三郎尾根〜地蔵尾根周回', start: '美濃戸口', goal: '美濃戸口', km: 17.0, up: 1550, down: 1550, ct: h(9, 40) },
    tags: ['terrain.rockridge', 'terrain.skyline', 'terrain.gare', 'terrain.stream', 'technical.chain', 'technical.ladder', 'technical.steepup', 'technical.steepdown', 'technical.knife', 'scenery.alps', 'scenery.fuji', 'scenery.panorama', 'scenery.cloudsea', 'style.loop', 'style.hut', 'season.summer', 'season.autumn', 'season.midwinter', 'stamina.long', 'stamina.bigascent', 'difficulty.rocky', 'access.bus', 'access.car', 'access.parking', 'facility.hut', 'facility.toilet', 'danger.fall', 'danger.rockfall', 'danger.wind', 'danger.thunder', 'crowd.popular', 'feature.volcano', 'feature.high', 'title.hyaku', 'preference.adventure', 'preference.achievement', 'preference.view'],
    ratings: { stamina: 4, technical: 4, fear: 4 },
  },
  {
    key: 'tsubakuro', name: '燕岳', kana: 'つばくろだけ', region: '甲信越', prefs: ['長野県'], elev: 2763, range: '北アルプス', status: 'unclimbed', wish: 2, access: 240,
    course: { name: '中房温泉往復（合戦尾根）', start: '中房温泉', goal: '中房温泉', km: 11.0, up: 1300, down: 1300, ct: h(7, 30) },
    tags: ['terrain.ridge', 'terrain.gravel', 'terrain.forest', 'technical.steepup', 'scenery.alps', 'scenery.oddrock', 'scenery.flowers', 'scenery.sunrise', 'scenery.cloudsea', 'style.outandback', 'style.hut', 'season.summer', 'season.autumn', 'stamina.solid', 'stamina.bigascent', 'stamina.steep', 'difficulty.general', 'access.bus', 'access.seasonalbus', 'access.earlyhard', 'facility.hut', 'facility.onsen', 'facility.toilet', 'after.onsen', 'danger.thunder', 'danger.altitude', 'crowd.crowded', 'feature.high', 'title.nihyaku', 'title.hana', 'preference.view', 'preference.achievement'],
    ratings: { stamina: 4, technical: 2, fear: 1 },
  },
  {
    key: 'mitake', name: '御岳山', kana: 'みたけさん', region: '関東', prefs: ['東京都'], elev: 929, range: '奥多摩', status: 'unclimbed', wish: 1, access: 90,
    course: { name: 'ケーブル利用・ロックガーデン周回', start: '滝本駅', goal: '滝本駅', km: 8.0, up: 500, down: 500, ct: h(3, 30) },
    tags: ['terrain.stream', 'terrain.forest', 'scenery.waterfall', 'scenery.brook', 'scenery.greenery', 'scenery.autumn', 'style.loop', 'style.cablecar', 'style.dayhike', 'season.allyear', 'season.freshgreen', 'stamina.light', 'difficulty.hiking', 'access.bus', 'access.public', 'facility.toilet', 'facility.restaurant', 'facility.shop', 'after.soba', 'after.onsen', 'crowd.popular', 'feature.low', 'preference.beginnerfriendly'],
    ratings: { stamina: 1, technical: 1, fear: 1 },
  },
];

interface SampleRecord {
  mountains: string[];
  date: string;
  endDate?: string;
  course: string;
  start: string;
  goal: string;
  km: number;
  up: number;
  down: number;
  dur: number;
  ct: number;
  weather: string;
  temp?: number;
  trail: string;
  crowd: string;
  transport: string[];
  gear?: string;
  impressions: string;
  ratings: Ratings;
  tags?: string[];
}

const RECORDS: SampleRecord[] = [
  { mountains: ['takao'], date: '2023-11-12', course: '稲荷山コース〜6号路', start: '高尾山口駅', goal: '高尾山口駅', km: 7.5, up: 560, down: 560, dur: h(3, 20), ct: h(3, 10), weather: '晴れ', temp: 12, trail: '落ち葉', crowd: '大混雑', transport: ['電車'], impressions: '紅葉シーズンでとにかく人が多い。でも山頂からの富士山は最高。', ratings: { stamina: 1, technical: 1, fear: 1, scenery: 3, fun: 3, revisit: 3, affinity: 3 } },
  { mountains: ['oyama'], date: '2024-03-20', course: '表参道〜見晴台', start: '大山ケーブルバス停', goal: '大山ケーブルバス停', km: 7.0, up: 950, down: 950, dur: h(4, 0), ct: h(4, 20), weather: '晴れ時々曇り', temp: 8, trail: 'ぬかるみ', crowd: '多い', transport: ['電車', 'バス'], impressions: '階段が延々と続く。相模湾の眺めが良かった。', ratings: { stamina: 3, technical: 1, fear: 1, scenery: 4, fun: 3, revisit: 3, affinity: 3 } },
  { mountains: ['izugatake'], date: '2024-05-04', course: '正丸駅〜伊豆ヶ岳〜子ノ権現〜吾野駅', start: '正丸駅', goal: '吾野駅', km: 13.0, up: 1050, down: 1150, dur: h(5, 10), ct: h(5, 30), weather: '晴れ', temp: 18, trail: '良好', crowd: '少なめ', transport: ['電車'], impressions: '男坂の鎖場は迂回。アップダウンの多い尾根で歩きごたえあり。', ratings: { stamina: 3, technical: 2, fear: 2, scenery: 2, fun: 4, revisit: 3, affinity: 4 } },
  { mountains: ['ryokami'], date: '2024-06-02', course: '日向大谷口往復', start: '日向大谷口', goal: '日向大谷口', km: 11.0, up: 1150, down: 1150, dur: h(5, 50), ct: h(6, 10), weather: '曇り', temp: 17, trail: '濡れ', crowd: '静か', transport: ['車'], gear: 'グローブ', impressions: '清滝小屋から上の鎖場連続が緊張した。岩の稜線は冒険感たっぷり。', ratings: { stamina: 4, technical: 4, fear: 4, scenery: 3, fun: 5, revisit: 4, affinity: 4 } },
  { mountains: ['iizuna'], date: '2024-08-16', course: '一の鳥居苑地往復', start: '一の鳥居苑地', goal: '一の鳥居苑地', km: 7.5, up: 850, down: 850, dur: h(4, 10), ct: h(4, 30), weather: '快晴', temp: 22, trail: '乾燥', crowd: '普通', transport: ['車'], impressions: '山頂からの北アルプスの大展望！下山後の戸隠そばが最高。', ratings: { stamina: 3, technical: 1, fear: 1, scenery: 5, fun: 4, revisit: 4, affinity: 5 } },
  { mountains: ['hiru'], date: '2024-10-19', endDate: '2024-10-20', course: '大倉〜塔ノ岳〜丹沢山〜蛭ヶ岳（山荘泊）往復', start: '大倉バス停', goal: '大倉バス停', km: 23.0, up: 2150, down: 2150, dur: h(12, 0), ct: h(12, 30), weather: '晴れ', temp: 9, trail: '良好', crowd: '普通', transport: ['電車', 'バス'], gear: 'ヘッドライト、防寒着', impressions: '丹沢主稜の尾根歩きが本当に楽しい。蛭ヶ岳山荘からの夕日と富士山、翌朝の雲海。', ratings: { stamina: 5, technical: 2, fear: 1, scenery: 5, fun: 5, revisit: 5, affinity: 5 }, tags: ['scenery.sunset'] },
  { mountains: ['kintoki'], date: '2025-01-03', course: '公時神社〜金時山〜矢倉沢峠', start: '金時登山口バス停', goal: '金時登山口バス停', km: 5.0, up: 600, down: 600, dur: h(2, 30), ct: h(2, 40), weather: '快晴', temp: 3, trail: '凍結', crowd: '多い', transport: ['電車', 'バス'], gear: 'チェーンスパイク', impressions: '正月の富士山がドーンと。短いけど満足度が高い。', ratings: { stamina: 2, technical: 2, fear: 1, scenery: 5, fun: 4, revisit: 4, affinity: 4 } },
  { mountains: ['takao'], date: '2025-04-12', course: '6号路〜稲荷山コース', start: '高尾山口駅', goal: '高尾山口駅', km: 7.0, up: 540, down: 540, dur: h(3, 0), ct: h(3, 0), weather: '曇り', temp: 15, trail: '良好', crowd: '多い', transport: ['電車'], impressions: '沢沿いの6号路は新緑がきれい。トレーニング向き。', ratings: { stamina: 1, technical: 1, fear: 1, scenery: 3, fun: 3, revisit: 3, affinity: 3 } },
];

export function buildSampleData(): { mountains: Mountain[]; records: ClimbRecord[] } {
  const idByKey = new Map<string, string>();
  const mountains = SAMPLES.map((s) => {
    const m = createMountain({
      name: s.name,
      kana: s.kana,
      region: s.region,
      prefectures: s.prefs,
      elevationM: s.elev,
      range: s.range,
      status: s.status,
      wish: s.wish ?? 0,
      favorite: !!s.fav,
      accessMinutes: s.access,
      tagIds: s.tags.filter(Boolean),
      courses: [
        createCourse({
          name: s.course.name,
          start: s.course.start,
          goal: s.course.goal,
          distanceKm: s.course.km,
          ascentM: s.course.up,
          descentM: s.course.down,
          courseTimeMin: s.course.ct,
          note: '数値は目安（サンプル）',
        }),
      ],
      ratings: s.ratings ?? {},
      memo: s.memo ?? '（サンプル）数値は一般的なコースの目安です。',
      ext: { sample: true },
    });
    idByKey.set(s.key, m.id);
    return m;
  });
  const records = RECORDS.map((r) =>
    createRecord({
      mountainIds: r.mountains.map((k) => idByKey.get(k)!),
      date: r.date,
      endDate: r.endDate,
      courseName: r.course,
      start: r.start,
      goal: r.goal,
      distanceKm: r.km,
      ascentM: r.up,
      descentM: r.down,
      durationMin: r.dur,
      courseTimeMin: r.ct,
      weather: r.weather,
      temperatureC: r.temp,
      trailCondition: r.trail,
      crowd: r.crowd,
      transport: r.transport,
      gear: r.gear ?? '',
      impressions: r.impressions,
      ratings: r.ratings,
      tagIds: r.tags ?? [],
      ext: { sample: true },
    }),
  );
  return { mountains, records };
}

export function isSample(e: { ext?: Record<string, unknown> }): boolean {
  return e.ext?.sample === true;
}
