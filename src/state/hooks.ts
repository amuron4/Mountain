import { createContext } from 'preact';
import { useContext, useCallback, useEffect, useState } from 'preact/hooks';
import type { AppStore } from './store';

export const StoreContext = createContext<AppStore | null>(null);

/** ストアを取得し、データ変更時に再描画する */
export function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((x) => x + 1), []);
  useEffect(() => store.subscribe(force), [store]);
  return store;
}
