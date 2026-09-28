import { T } from '../presets';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 季節ごとに「向いている」とみなすタグ */
export function seasonTagIds(date: Date): string[] {
  const m = date.getMonth() + 1;
  const ids: string[] = [T.seasonAllyear];
  switch (seasonOf(date)) {
    case 'spring':
      ids.push(T.seasonSpring, T.seasonFreshgreen, T.seasonFlower);
      if (m <= 5) ids.push(T.seasonLatesnow);
      break;
    case 'summer':
      ids.push(T.seasonSummer, T.seasonFlower);
      break;
    case 'autumn':
      ids.push(T.seasonAutumn, T.seasonFoliage);
      break;
    case 'winter':
      ids.push(T.seasonWinter, T.seasonMidwinter);
      break;
  }
  return ids;
}
