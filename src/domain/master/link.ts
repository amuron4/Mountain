/**
 * 山マスター ⇔ ユーザーの Mountain の対応付け。
 * - 山マスターから Mountain を作る（既存の location / masterId フィールドへ自然にコピー）
 * - 既に登録済みかの判定（同名別山を誤判定しないよう、masterId または「座標が近い＋同名」で判定）
 */
import { regionOfPrefecture } from '../geo';
import { createMountain } from '../mountain';
import type { GeoPoint, Mountain } from '../types';
import { normalizeText } from '../util';
import type { MountainMaster } from './types';

/** 2点間の距離（m）。ハバーサイン */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 「同じ山」とみなす距離（座標＋同名での判定に使う） */
export const SAME_MOUNTAIN_DISTANCE_M = 300;

export function masterPoint(m: MountainMaster): GeoPoint {
  return { lat: m.latitude, lng: m.longitude };
}

/** 山登録フォームへ流し込む項目 */
export function masterToMountainFields(
  m: MountainMaster,
): Pick<Mountain, 'name' | 'kana' | 'prefectures' | 'region' | 'range' | 'location' | 'masterId'> & { elevationM?: number; ext?: Mountain['ext'] } {
  return {
    name: m.name,
    kana: m.kana,
    // 自分の山の標高は整数 m（表示と同じ）。出典は ext に残し、DEM 由来か公表値かを区別できるようにする
    elevationM: m.elevationM !== undefined ? Math.round(m.elevationM) : undefined,
    ext: m.elevationM !== undefined && m.elevationSource ? { elevationSource: m.elevationSource } : undefined,
    prefectures: [...m.prefectures],
    region: m.prefectures[0] ? regionOfPrefecture(m.prefectures[0]) ?? '' : '',
    range: m.range ?? '',
    location: masterPoint(m),
    masterId: m.id,
  };
}

/**
 * 既存の（手入力の）山を山マスターに紐づける。ユーザーが入力済みの値は上書きせず、空欄だけ補う。
 */
export function linkMountainToMaster(mountain: Mountain, m: MountainMaster): Mountain {
  const f = masterToMountainFields(m);
  return {
    ...mountain,
    masterId: f.masterId,
    location: f.location,
    kana: mountain.kana || f.kana,
    prefectures: mountain.prefectures.length ? mountain.prefectures : f.prefectures,
    region: mountain.region || f.region,
    range: mountain.range || f.range,
    elevationM: mountain.elevationM ?? f.elevationM,
    // 入力済みの標高を残した場合は出典を付け替えない
    ext: mountain.elevationM === undefined && f.ext ? { ...(mountain.ext ?? {}), ...f.ext } : mountain.ext,
  };
}

/** 山マスターから新しい Mountain を作る（未踏・行きたい度なしで開始） */
export function mountainFromMaster(m: MountainMaster): Mountain {
  return createMountain(masterToMountainFields(m));
}

function sameName(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

/**
 * マスターの山が既に登録済みか。
 * 1. masterId が一致
 * 2. 位置が SAME_MOUNTAIN_DISTANCE_M 以内 かつ 山名（または読み）が一致
 *    （手入力で登録した山や、データ更新で ID が変わった場合の保険）
 * 名前だけでは判定しない（「大山」「丸山」など同名の別山が多いため）。
 */
export function isSameMountain(master: MountainMaster, mountain: Mountain): boolean {
  if (mountain.masterId) return mountain.masterId === master.id || (!!mountain.location && closeAndSameName(master, mountain));
  return !!mountain.location && closeAndSameName(master, mountain);
}

function closeAndSameName(master: MountainMaster, mountain: Mountain): boolean {
  if (!mountain.location) return false;
  if (!(sameName(master.name, mountain.name) || (!!mountain.kana && sameName(master.kana, mountain.kana)))) return false;
  return distanceMeters(masterPoint(master), mountain.location) <= SAME_MOUNTAIN_DISTANCE_M;
}

/** 一覧表示で何度も判定するための索引 */
export class RegisteredLookup {
  private byMasterId = new Map<string, Mountain>();
  private located: Mountain[] = [];
  private unlocated: Mountain[] = [];

  constructor(mountains: Mountain[]) {
    for (const m of mountains) {
      if (m.masterId) this.byMasterId.set(m.masterId, m);
      if (m.location) this.located.push(m);
      else if (!m.masterId) this.unlocated.push(m);
    }
  }

  find(master: MountainMaster): Mountain | undefined {
    return this.byMasterId.get(master.id) ?? this.located.find((m) => closeAndSameName(master, m));
  }

  /**
   * 位置情報のない（手入力の）山で、同名かつ同じ都道府県のもの。
   * 同じ山かは判定できないので「登録済み」とはせず、ユーザーに確認・紐づけを促すために使う。
   */
  findSimilarUnlocated(master: MountainMaster): Mountain | undefined {
    return this.unlocated.find(
      (m) => sameName(m.name, master.name) && (m.prefectures.length === 0 || m.prefectures.some((p) => master.prefectures.includes(p))),
    );
  }
}
