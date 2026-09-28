/**
 * ハッシュベースの小さなルーター（静的ホスティング・PWA・オフラインで確実に動くように）。
 */
import { useEffect, useState } from 'preact/hooks';

export interface Route {
  name: string;
  params: Record<string, string>;
  query: URLSearchParams;
  path: string;
}

const ROUTES: [name: string, pattern: string][] = [
  ['home', '/'],
  ['mountains', '/mountains'],
  ['mountainNew', '/mountains/new'],
  ['mountainEdit', '/mountains/:id/edit'],
  ['mountain', '/mountains/:id'],
  ['records', '/records'],
  ['recordNew', '/records/new'],
  ['recordEdit', '/records/:id/edit'],
  ['record', '/records/:id'],
  ['compare', '/compare'],
  ['today', '/today'],
  ['settings', '/settings'],
  ['tags', '/settings/tags'],
];

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(queryPart);
  const segs = path.split('/').filter(Boolean);
  for (const [name, pattern] of ROUTES) {
    const psegs = pattern.split('/').filter(Boolean);
    if (psegs.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < psegs.length; i++) {
      if (psegs[i].startsWith(':')) params[psegs[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (psegs[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { name, params, query, path };
  }
  return { name: 'notFound', params: {}, query, path };
}

/**
 * 履歴エントリごとに連番(idx)を振り、アプリ内で「戻れる」かを判定する。
 * <a href="#/..."> による遷移も hashchange で拾えるので、どの遷移方法でも正しく戻れる。
 */
let counter = 0;
function stampHistory() {
  const st = history.state as { idx?: number } | null;
  if (!st || typeof st.idx !== 'number') {
    history.replaceState({ ...(st ?? {}), idx: ++counter }, '');
  } else {
    counter = Math.max(counter, st.idx);
  }
}
if (typeof window !== 'undefined') {
  stampHistory();
  window.addEventListener('hashchange', stampHistory);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = `#${to}`;
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = to;
  }
}

/** アプリ内に戻れる履歴があれば戻る、無ければ fallback へ */
export function goBack(fallback = '/') {
  const idx = (history.state as { idx?: number } | null)?.idx ?? 1;
  if (idx > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
