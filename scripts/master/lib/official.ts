/**
 * 国土地理院「日本の主な山岳標高」の公式 CSV の場所をページから探す（ビルド時のみ）。
 * ファイル名は版ごとに変わるため、固定 URL ではなく公式ページのリンクから CSV を見つける。
 */
export const OFFICIAL_PAGE_URL = 'https://www.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html';

export interface FoundLink {
  url: string;
  text: string;
}

/** HTML 中の .csv へのリンクを、山岳標高の一覧らしいものから順に返す */
export function findCsvLinks(html: string, pageUrl = OFFICIAL_PAGE_URL): FoundLink[] {
  const links: FoundLink[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+\.csv)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    try {
      links.push({ url: new URL(m[1], pageUrl).toString(), text });
    } catch {
      /* 不正な URL は無視 */
    }
  }
  const score = (l: FoundLink) => (/1003|山岳標高|山岳/.test(l.text) ? 0 : 1) + (/2500|最高地点/.test(l.text) ? 1 : 0);
  return links.sort((a, b) => score(a) - score(b));
}
