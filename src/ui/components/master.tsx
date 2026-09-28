/**
 * 山マスター（検索用の山名データ）の UI 部品。
 * - MasterHitRow: 検索結果1行（同名の山を 山名・標高・都道府県 で見分けられる表示）
 * - MasterSuggest: 山登録フォームの山名オートコンプリート
 * - MasterSearchPanel: 山一覧の「山を探す」タブ
 * - PrefectureFilterSheet: 都道府県フィルター
 */
import { useMemo, useState } from 'preact/hooks';
import { REGIONS } from '../../domain/geo';
import { RegisteredLookup } from '../../domain/master/link';
import type { MountainMaster } from '../../domain/master/types';
import type { Mountain } from '../../domain/types';
import { useStore } from '../../state/hooks';
import { useDebounced, useMaster } from '../../state/master';
import { navigate } from '../../state/router';
import { Icon } from './Icon';
import { confirmDialog, Sheet, toast } from './overlay';

/** 検索結果の中で「同じ山名・同じ主な都道府県」が複数ある山の ID */
export function ambiguousIds(masters: MountainMaster[]): Set<string> {
  const count = new Map<string, number>();
  const key = (m: MountainMaster) => `${m.name}|${m.prefectures[0]}`;
  for (const m of masters) count.set(key(m), (count.get(key(m)) ?? 0) + 1);
  return new Set(masters.filter((m) => (count.get(key(m)) ?? 0) > 1).map((m) => m.id));
}

export function formatMasterElevation(m: MountainMaster): string {
  return m.elevationM !== undefined ? `${Math.round(m.elevationM).toLocaleString('ja-JP')}m` : '標高不明';
}

// ---------------------------------------------------------------------------

interface HitRowProps {
  master: MountainMaster;
  registered?: Mountain;
  /** 位置情報のない同名の山が登録済み（同じ山か判定できない） */
  similar?: Mountain;
  /** 同じ山名・同じ都道府県の山が他にもある場合、座標を出して見分けられるようにする */
  showLocation?: boolean;
  /** 行のタップ（詳しく登録 / 候補の選択） */
  onSelect: () => void;
  /** ワンタップ登録ボタンを出す場合 */
  onAdd?: () => void;
  compact?: boolean;
}

export function MasterHitRow({ master, registered, similar, onSelect, onAdd, compact, showLocation }: HitRowProps) {
  return (
    <div class={`mh-row ${compact ? 'compact' : ''}`} data-testid="master-hit" data-master-id={master.id}>
      <button type="button" class="mh-main" onClick={onSelect} aria-label={`${master.name}（${master.prefectures.join('・')}）`}>
        <span class="mh-name">
          {master.name}
          <span class={`mh-elev num ${master.elevationM === undefined ? 'unknown' : ''}`}>{formatMasterElevation(master)}</span>
          {!registered && similar && <span class="mh-badge similar">同名の登録あり</span>}
        </span>
        <span class="mh-sub">
          <span class="mh-kana">{master.kana}</span>
          <span class="mh-pref">{master.prefectures.join('・')}</span>
          {showLocation && (
            <span class="mh-loc num" title="同名の山を見分けるための山頂位置（緯度, 経度）">
              📍{master.latitude.toFixed(3)}, {master.longitude.toFixed(3)}
            </span>
          )}
        </span>
      </button>
      {registered ? (
        <a class="mh-action registered" href={`#/mountains/${registered.id}`} aria-label={`${master.name}（登録済み）を開く`}>
          <span class="mh-badge done">登録済み</span>
          <Icon name="right" size={16} />
        </a>
      ) : onAdd ? (
        <button type="button" class="mh-action add" onClick={onAdd} aria-label={`${master.name}を自分の山に追加`}>
          <Icon name="plus" size={16} strokeWidth={2.4} />
          <span>追加</span>
        </button>
      ) : (
        !compact && <span class="mh-badge">未登録</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SuggestProps {
  query: string;
  onPick: (m: MountainMaster) => void;
  limit?: number;
}

/** 山名入力欄の下に出す候補リスト */
export function MasterSuggest({ query, onPick, limit = 8 }: SuggestProps) {
  const store = useStore();
  const master = useMaster();
  const q = useDebounced(query, 100);
  const lookup = useMemo(() => new RegisteredLookup(store.state.mountains), [store.state.mountains]);
  const result = useMemo(() => (master.index && q.trim() ? master.index.search(q, { limit }) : undefined), [master.index, q, limit]);
  const dupIds = useMemo(() => ambiguousIds(result?.hits.map((h) => h.master) ?? []), [result]);

  if (!query.trim()) return null;
  if (master.status === 'loading' || master.status === 'idle') return <div class="mh-suggest hint">山名データを読み込み中…</div>;
  if (master.status === 'error') return null;
  if (!result || result.total === 0) return <div class="mh-suggest hint">山名データに候補がありません（このまま手入力で登録できます）</div>;
  return (
    <div class="mh-suggest" role="listbox" aria-label="山名の候補" data-testid="master-suggest">
      <div class="mh-suggest-head">
        <Icon name="search" size={14} />
        山名データの候補 {result.total > limit ? `（${result.total}件中 上位${limit}件）` : `（${result.total}件）`}
      </div>
      {result.hits.map((h) => (
        <MasterHitRow
          key={h.master.id}
          master={h.master}
          registered={lookup.find(h.master)}
          similar={lookup.findSimilarUnlocated(h.master)}
          onSelect={() => onPick(h.master)}
          showLocation={dupIds.has(h.master.id)}
          compact
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PrefectureFilterSheet({ options, selected, onChange, onClose }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; onClose: () => void }) {
  const toggle = (p: string) => onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  const groups = REGIONS.map((r) => ({ name: r.name, prefs: r.prefectures.filter((p) => options.includes(p)) })).filter((g) => g.prefs.length);
  return (
    <Sheet
      title="都道府県で絞り込み"
      onClose={onClose}
      testId="pref-filter-sheet"
      footer={
        <>
          <button class="btn" onClick={() => onChange([])}>
            すべて
          </button>
          <button class="btn primary" onClick={onClose} data-testid="pref-filter-done">
            決定
          </button>
        </>
      }
    >
      <div class="hint">複数選べます。県境の山は、どちらの都県を選んでも表示されます。</div>
      {groups.map((g) => (
        <div class="field" key={g.name}>
          <span class="label">{g.name}</span>
          <div class="chips">
            {g.prefs.map((p) => (
              <button type="button" key={p} class={`chip ${selected.includes(p) ? 'on' : ''}`} aria-pressed={selected.includes(p)} onClick={() => toggle(p)}>
                {selected.includes(p) && <Icon name="check" size={14} strokeWidth={2.6} />}
                {p}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

interface PanelProps {
  query: string;
  onQuery: (q: string) => void;
  prefectures: string[];
  onPrefectures: (p: string[]) => void;
}

const PAGE = 30;

/** 山一覧の「山を探す」タブ。自分の山に未登録の山も含めて山名データから探す */
export function MasterSearchPanel({ query, onQuery, prefectures, onPrefectures }: PanelProps) {
  const store = useStore();
  const master = useMaster();
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);
  const q = useDebounced(query, 120);
  const lookup = useMemo(() => new RegisteredLookup(store.state.mountains), [store.state.mountains]);
  const result = useMemo(
    () => (master.index ? master.index.search(q, { prefectures, limit }) : undefined),
    [master.index, q, prefectures, limit],
  );
  const options = master.manifest?.prefectures ?? [];
  const dupIds = useMemo(() => ambiguousIds(result?.hits.map((h) => h.master) ?? []), [result]);

  const add = async (m: MountainMaster) => {
    const similar = lookup.findSimilarUnlocated(m);
    if (similar) {
      const link = await confirmDialog({
        title: `同じ名前の「${similar.name}」が登録済みです`,
        message: `登録済みの「${similar.name}」${similar.prefectures.length ? `（${similar.prefectures.join('・')}）` : ''}には位置情報がないため、同じ山か判定できません。\n同じ山なら、登録済みの山に位置・読みなどを紐づけられます（入力済みの内容は変わりません）。\n別の山として登録する場合は、行をタップして詳しく登録してください。`,
        okLabel: '登録済みの山に紐づける',
        cancelLabel: 'やめる',
      });
      if (!link) return;
      await store.linkToMaster(similar.id, m);
      toast(`「${similar.name}」に位置情報を紐づけました`);
      return;
    }
    const res = await store.registerFromMaster(m);
    toast(res.created ? `「${m.name}」を自分の山に追加しました` : `「${m.name}」は登録済みです`);
  };

  return (
    <>
      <div class="search-bar">
        <label class="search-box">
          <Icon name="search" size={19} />
          <input
            type="search"
            value={query}
            placeholder="山名・よみで探す（例: ぶこう）"
            aria-label="山名データを検索"
            enterKeyHint="search"
            onInput={(e) => {
              onQuery((e.target as HTMLInputElement).value);
              setLimit(PAGE);
            }}
          />
          {query && (
            <button type="button" class="icon-btn" aria-label="検索をクリア" onClick={() => onQuery('')}>
              <Icon name="x" size={18} />
            </button>
          )}
        </label>
        <button class="btn filter-btn" onClick={() => setSheet(true)} aria-label="都道府県で絞り込み" data-testid="open-pref-filter">
          <Icon name="filter" size={18} />
          都道府県
          {prefectures.length > 0 && <span class="badge-dot">{prefectures.length}</span>}
        </button>
      </div>

      {prefectures.length > 0 && (
        <div class="chips" data-testid="pref-chips">
          {prefectures.map((p) => (
            <button type="button" key={p} class="chip on" onClick={() => onPrefectures(prefectures.filter((x) => x !== p))} aria-label={`${p}の絞り込みを外す`}>
              {p}
              <Icon name="x" size={14} class="x" />
            </button>
          ))}
          <button type="button" class="chip" onClick={() => onPrefectures([])}>
            すべての都県
          </button>
        </div>
      )}

      {master.status === 'error' && (
        <div class="warn-box">
          山名データを読み込めませんでした。{master.error}
          <button class="btn small" style={{ marginLeft: '8px' }} onClick={master.retry}>
            再試行
          </button>
        </div>
      )}
      {(master.status === 'loading' || master.status === 'idle') && <div class="empty">山名データを読み込み中…</div>}

      {master.status === 'ready' && result && (
        <>
          <div class="result-meta">
            <span data-testid="master-count">
              {q.trim() || prefectures.length ? `${result.total.toLocaleString()}座` : `${master.index!.size.toLocaleString()}座の山名データ`}
            </span>
            <a href="#/settings?about=master" class="small">
              出典: 国土地理院
            </a>
          </div>
          {!q.trim() && !prefectures.length && (
            <div class="info-box">
              山名や読み（ひらがな・カタカナ）で、まだ登録していない山も探せます。
              <br />
              「追加」で自分の山に登録し、あとからコース・タグ・評価を追加できます。
            </div>
          )}
          <div class="list" data-testid="master-results">
            {result.hits.map((h) => (
              <MasterHitRow
                key={h.master.id}
                master={h.master}
                registered={lookup.find(h.master)}
                similar={lookup.findSimilarUnlocated(h.master)}
                onSelect={() => navigate(`/mountains/new?master=${encodeURIComponent(h.master.id)}`)}
                onAdd={() => add(h.master)}
                showLocation={dupIds.has(h.master.id)}
              />
            ))}
          </div>
          {result.total > result.hits.length && (
            <button class="btn block" onClick={() => setLimit(limit + PAGE)} data-testid="master-more">
              さらに表示（残り{(result.total - result.hits.length).toLocaleString()}座）
            </button>
          )}
          {(q.trim() || prefectures.length > 0) && result.total === 0 && (
            <div class="empty">
              見つかりませんでした。
              <br />
              <a class="btn small" style={{ marginTop: '10px' }} href="#/mountains/new">
                手入力で登録する
              </a>
            </div>
          )}
        </>
      )}
      {sheet && <PrefectureFilterSheet options={options} selected={prefectures} onChange={onPrefectures} onClose={() => setSheet(false)} />}
    </>
  );
}
