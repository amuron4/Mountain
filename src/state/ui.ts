/**
 * 画面をまたいで保持したい UI 状態（一覧の絞り込み条件・比較対象）。
 * sessionStorage に保存し、詳細画面から戻っても条件が残るようにする。
 */
import { useExternalStore } from './hooks';
import { emptyFilter, type MountainFilter, type SortSpec } from '../domain/filter';
import type { ID } from '../domain/types';

interface UiState {
  filter: MountainFilter;
  sort: SortSpec;
  compareIds: ID[];
  selectMode: boolean;
  /** 山一覧のタブ: 自分の山 / 山名データから探す */
  listTab: 'mine' | 'search';
  masterQuery: string;
  masterPrefectures: string[];
}

const KEY = 'yama-note-ui';
export const MAX_COMPARE = 3;

function load(): UiState {
  const base: UiState = {
    filter: emptyFilter(),
    sort: { key: 'updated', dir: 'desc' },
    compareIds: [],
    selectMode: false,
    listTab: 'mine',
    masterQuery: '',
    masterPrefectures: [],
  };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<UiState>;
    return { ...base, ...parsed, filter: { ...base.filter, ...(parsed.filter ?? {}) } };
  } catch {
    return base;
  }
}

let state: UiState = load();
const listeners = new Set<() => void>();

export function getUi(): UiState {
  return state;
}

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 保存できなくても動作は継続 */
  }
  listeners.forEach((fn) => fn());
}

export function toggleCompare(id: ID): boolean {
  const ids = state.compareIds;
  if (ids.includes(id)) {
    setUi({ compareIds: ids.filter((x) => x !== id) });
    return true;
  }
  if (ids.length >= MAX_COMPARE) return false;
  setUi({ compareIds: [...ids, id] });
  return true;
}

const subscribeUi = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useUi(): UiState {
  useExternalStore(subscribeUi, () => state);
  return state;
}
