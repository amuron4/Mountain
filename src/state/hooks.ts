import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { AppStore } from './store';

export const StoreContext = createContext<AppStore | null>(null);

/**
 * 外部ストアを購読して、変更時に再描画する共通フック。
 * useEffect での購読は描画の後に行われるため、その間に起きた変更（起動直後の読み込み完了など）を
 * 取りこぼさないよう、購読直後に描画時点の版と比べて差があれば再描画する。
 */
export function useExternalStore(subscribe: (fn: () => void) => () => void, getVersion: () => unknown): void {
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((x) => x + 1), []);
  const rendered = useRef<unknown>(undefined);
  rendered.current = getVersion();
  useEffect(() => {
    const unsubscribe = subscribe(force);
    if (getVersion() !== rendered.current) force();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, force]);
}

/** ストアを取得し、データ変更時に再描画する */
export function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
  useExternalStore(subscribe, () => store.version);
  return store;
}
