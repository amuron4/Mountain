/**
 * 山マスターの読み込み状態（アプリ全体で1つ）。
 * - 起動時には何もしない。検索 UI を初めて表示したときに manifest とチャンクを読み込み、索引を作る。
 * - ユーザーデータ（AppStore）とは独立している。
 */
import { useEffect, useState } from 'preact/hooks';
import { useExternalStore } from './hooks';
import { StaticMasterRepository, type MasterRepository } from '../data/masterRepository';
import { MasterIndex } from '../domain/master/search';
import type { MasterManifest } from '../domain/master/types';

export type MasterStatus = 'idle' | 'loading' | 'ready' | 'error';

interface MasterState {
  status: MasterStatus;
  index?: MasterIndex;
  manifest?: MasterManifest;
  error?: string;
}

let repo: MasterRepository = new StaticMasterRepository();
let state: MasterState = { status: 'idle' };
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: MasterState) {
  state = next;
  listeners.forEach((fn) => fn());
}

/** テスト用に差し替え */
export function setMasterRepository(r: MasterRepository) {
  repo = r;
  state = { status: 'idle' };
  loading = undefined;
}

export function getMasterState(): MasterState {
  return state;
}

export function loadMaster(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();
  loading ??= (async () => {
    set({ ...state, status: 'loading' });
    try {
      const [manifest, items] = await Promise.all([repo.loadManifest(), repo.loadAll()]);
      set({ status: 'ready', manifest, index: new MasterIndex(items) });
    } catch (e) {
      loading = undefined;
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return loading;
}

const subscribeMaster = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** 山マスターを使う画面で呼ぶ（初回に遅延ロード） */
export function useMaster(autoLoad = true): MasterState & { retry: () => void } {
  useExternalStore(subscribeMaster, () => state);
  useEffect(() => {
    if (autoLoad && state.status === 'idle') void loadMaster();
  }, [autoLoad]);
  return { ...state, retry: () => void loadMaster() };
}

/** 入力に追従して検索するときの遅延（ms）。打鍵ごとの再計算を抑える */
export function useDebounced<T>(value: T, ms = 120): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
