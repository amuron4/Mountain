/**
 * 緯度経度から都道府県を判定する（ビルド時のみ使用）。
 *
 * 行政区域ポリゴン（国土数値情報 行政区域データを加工したもの）に対する点の内外判定を行い、
 * さらに「他の都道府県の境界まで tolerance 以内」の場合はその都道府県も所在地に加える
 * （県境上の山を ["埼玉県", "東京都"] のように複数都県で持てるようにするため）。
 * 簡略化されたポリゴンの誤差を吸収する目的もある。矩形（bbox）は候補の絞り込みにだけ使う。
 */

type Ring = number[][]; // [lon, lat][]

interface Poly {
  outer: Ring;
  holes: Ring[];
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

interface PrefShape {
  name: string;
  polys: Poly[];
  bbox: [number, number, number, number];
}

export interface GeoJsonFeature {
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } | null;
}

export interface PrefectureResult {
  /** 山頂点を含む（または最も近い）都道府県 */
  primary: string;
  /** 県境付近の場合は複数。先頭が primary */
  all: string[];
  /** 点がどのポリゴンにも含まれず、最寄りで補った場合 true */
  approximated: boolean;
}

function ringBbox(r: Ring): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of r) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

function mergeBbox(boxes: [number, number, number, number][]): [number, number, number, number] {
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

/** 偶奇規則による点の内外判定 */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(lon: number, lat: number, p: Poly): boolean {
  if (lon < p.bbox[0] || lon > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) return false;
  if (!pointInRing(lon, lat, p.outer)) return false;
  return !p.holes.some((h) => pointInRing(lon, lat, h));
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQ = 111_320;

/** 点から線分までの距離（m）。点の周辺で正距円筒に投影して計算（数km 以内なら十分な精度） */
export function distanceToSegmentM(lon: number, lat: number, a: number[], b: number[]): number {
  const kx = M_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180);
  const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * M_PER_DEG_LAT;
  const bx = (b[0] - lon) * kx, by = (b[1] - lat) * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx, py = ay + t * dy;
  return Math.sqrt(px * px + py * py);
}

function distanceToRingM(lon: number, lat: number, ring: Ring): number {
  let min = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const d = distanceToSegmentM(lon, lat, ring[i - 1], ring[i]);
    if (d < min) min = d;
  }
  return min;
}

function degPad(lat: number, meters: number): [number, number] {
  return [meters / (M_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180)), meters / M_PER_DEG_LAT];
}

function inBbox(lon: number, lat: number, b: [number, number, number, number], pad: [number, number]): boolean {
  return lon >= b[0] - pad[0] && lon <= b[2] + pad[0] && lat >= b[1] - pad[1] && lat <= b[3] + pad[1];
}

export class PrefectureLocator {
  private prefs: PrefShape[] = [];

  /**
   * @param borderToleranceM 他県の境界までこの距離以内なら、その県も所在地に含める
   * @param maxSnapM どのポリゴンにも含まれない点（簡略化による隙間など）を最寄りの県に割り当てる最大距離
   */
  constructor(
    private borderToleranceM: number,
    private maxSnapM = 2000,
  ) {}

  /** 都道府県ごとの行政区域 GeoJSON（市区町村ポリゴンの集合）を追加 */
  addPrefecture(name: string, features: GeoJsonFeature[]) {
    const polys: Poly[] = [];
    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;
      const list = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
      for (const rings of list) {
        if (!rings.length) continue;
        polys.push({ outer: rings[0], holes: rings.slice(1), bbox: ringBbox(rings[0]) });
      }
    }
    if (!polys.length) throw new Error(`${name}: ポリゴンがありません`);
    this.prefs.push({ name, polys, bbox: mergeBbox(polys.map((p) => p.bbox)) });
  }

  get prefectureNames(): string[] {
    return this.prefs.map((p) => p.name);
  }

  /** 県の境界までの距離（m）。点がその県の内部にあっても外部にあっても境界までの最短距離 */
  distanceToPrefectureM(lon: number, lat: number, name: string, limitM: number): number {
    const pref = this.prefs.find((p) => p.name === name);
    if (!pref) return Infinity;
    const pad = degPad(lat, limitM);
    let min = Infinity;
    for (const p of pref.polys) {
      if (!inBbox(lon, lat, p.bbox, pad)) continue;
      for (const r of [p.outer, ...p.holes]) {
        const d = distanceToRingM(lon, lat, r);
        if (d < min) min = d;
      }
    }
    return min;
  }

  locate(lat: number, lon: number): PrefectureResult | undefined {
    const padTol = degPad(lat, Math.max(this.borderToleranceM, this.maxSnapM));
    const candidates = this.prefs.filter((p) => inBbox(lon, lat, p.bbox, padTol));
    const containing = candidates.filter((p) => p.polys.some((poly) => pointInPoly(lon, lat, poly)));

    // 各候補の境界までの距離
    const dist = new Map<string, number>();
    for (const p of candidates) dist.set(p.name, this.distanceToPrefectureM(lon, lat, p.name, this.maxSnapM));

    let primary: string;
    let approximated = false;
    if (containing.length === 1) primary = containing[0].name;
    else if (containing.length > 1) {
      // 簡略化による重なり: より内側（境界から遠い）方を主とする
      primary = [...containing].sort((a, b) => dist.get(b.name)! - dist.get(a.name)!)[0].name;
    } else {
      // どこにも含まれない（ポリゴンの隙間・海岸付近）: 最寄りの県へ
      const nearest = [...dist.entries()].sort((a, b) => a[1] - b[1])[0];
      if (!nearest || nearest[1] > this.maxSnapM) return undefined;
      primary = nearest[0];
      approximated = true;
    }

    const others = candidates
      .map((p) => p.name)
      .filter((n) => n !== primary && (containing.some((c) => c.name === n) || dist.get(n)! <= this.borderToleranceM))
      .sort((a, b) => dist.get(a)! - dist.get(b)!);
    return { primary, all: [primary, ...others], approximated };
  }
}
