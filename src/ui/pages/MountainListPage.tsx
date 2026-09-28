import { useEffect, useMemo, useState } from 'preact/hooks';
import { applyFilter, countActiveConditions, emptyFilter, QUICK_NUMERIC_PRESETS, SORT_OPTIONS, sortViews, type MountainFilter, type NumRange } from '../../domain/filter';
import { REGIONS } from '../../domain/geo';
import { RATING_DEFS } from '../../domain/ratings';
import type { MountainStatus, RatingKey } from '../../domain/types';
import { isFiniteNumber, uniq } from '../../domain/util';
import { useStore } from '../../state/hooks';
import { navigate } from '../../state/router';
import { getUi, MAX_COMPARE, setUi, toggleCompare, useUi } from '../../state/ui';
import { MountainCard } from '../components/cards';
import { Empty, Fold, PageHeader } from '../components/common';
import { MasterSearchPanel } from '../components/master';
import { Icon } from '../components/Icon';
import { Sheet, toast } from '../components/overlay';
import { TagPicker } from '../components/tags';

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'unclimbed', label: '未踏' },
  { value: 'climbed', label: '登頂済' },
  { value: 'revisit', label: '再訪' },
];

function RangeInputs({ label, unit, value, onChange, step }: { label: string; unit: string; value: NumRange; onChange: (r: NumRange) => void; step?: string }) {
  const parse = (s: string) => {
    const n = s.normalize('NFKC').trim();
    return n === '' || !Number.isFinite(Number(n)) ? undefined : Number(n);
  };
  return (
    <div class="field">
      <span class="label">{label}</span>
      <div class="grid-2" style={{ gap: '6px' }}>
        <div class="input-unit">
          <input inputMode={step ? 'decimal' : 'numeric'} placeholder="下限" value={value.min ?? ''} aria-label={`${label} 下限`} onInput={(e) => onChange({ ...value, min: parse((e.target as HTMLInputElement).value) })} />
          <span class="unit">{unit}以上</span>
        </div>
        <div class="input-unit">
          <input inputMode={step ? 'decimal' : 'numeric'} placeholder="上限" value={value.max ?? ''} aria-label={`${label} 上限`} onInput={(e) => onChange({ ...value, max: parse((e.target as HTMLInputElement).value) })} />
          <span class="unit">{unit}以下</span>
        </div>
      </div>
    </div>
  );
}

function FilterSheet({ onClose, resultCount }: { onClose: () => void; resultCount: (f: MountainFilter) => number }) {
  const store = useStore();
  const [f, setF] = useState<MountainFilter>(getUi().filter);
  const set = (patch: Partial<MountainFilter>) => setF((cur) => ({ ...cur, ...patch }));
  const ranges = uniq(store.state.mountains.map((m) => m.range).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'ja'));
  const usedRegions = new Set(store.state.mountains.map((m) => m.region));
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const count = resultCount(f);

  const setRatingBound = (kind: 'minRatings' | 'maxRatings', key: RatingKey, v: number | undefined) => {
    const next = { ...f[kind] };
    if (v === undefined) delete next[key];
    else next[key] = v;
    set({ [kind]: next } as Partial<MountainFilter>);
  };

  return (
    <Sheet
      title="絞り込み"
      onClose={onClose}
      full
      testId="filter-sheet"
      footer={
        <>
          <button class="btn" onClick={() => setF({ ...emptyFilter(), text: f.text })}>
            リセット
          </button>
          <button
            class="btn primary"
            data-testid="apply-filter"
            onClick={() => {
              setUi({ filter: f });
              onClose();
            }}
          >
            {count}座を表示
          </button>
        </>
      }
    >
      <Fold title="登頂状況・お気に入り" icon="🚩" open meta={f.statuses.length + (f.favoriteOnly ? 1 : 0) + (f.minWish ? 1 : 0) || ''}>
        <div class="chips">
          {(['unclimbed', 'climbed', 'revisit'] as MountainStatus[]).map((s) => (
            <button type="button" key={s} class={`chip ${f.statuses.includes(s) ? 'on' : ''}`} aria-pressed={f.statuses.includes(s)} onClick={() => set({ statuses: toggleIn(f.statuses, s) })}>
              {{ unclimbed: '未踏', climbed: '登頂済み', revisit: '再訪したい' }[s]}
            </button>
          ))}
          <button type="button" class={`chip ${f.favoriteOnly ? 'on' : ''}`} aria-pressed={f.favoriteOnly} onClick={() => set({ favoriteOnly: !f.favoriteOnly })}>
            ★ お気に入り
          </button>
        </div>
        <div class="field">
          <span class="label">行きたい度</span>
          <div class="segmented">
            {['指定なし', '★以上', '★★以上', '★★★'].map((l, i) => (
              <button type="button" key={i} aria-pressed={f.minWish === i} onClick={() => set({ minWish: i })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Fold>

      <Fold title="数値（距離・標高・時間）" icon="📏" open meta={[f.elevationM, f.distanceKm, f.ascentM, f.courseTimeH].filter((r) => isFiniteNumber(r.min) || isFiniteNumber(r.max)).length + (isFiniteNumber(f.accessMaxMin) ? 1 : 0) || ''}>
        <div class="chips">
          {QUICK_NUMERIC_PRESETS.map((p) => (
            <button type="button" key={p.id} class={`chip ${p.isActive(f) ? 'on' : ''}`} onClick={() => setF(p.isActive(f) ? { ...f, ...clearPreset(p.id) } : p.apply(f))}>
              {p.label}
            </button>
          ))}
        </div>
        <RangeInputs label="標高" unit="m" value={f.elevationM} onChange={(r) => set({ elevationM: r })} />
        <RangeInputs label="距離" unit="km" step="any" value={f.distanceKm} onChange={(r) => set({ distanceKm: r })} />
        <RangeInputs label="累積標高（登り）" unit="m" value={f.ascentM} onChange={(r) => set({ ascentM: r })} />
        <RangeInputs label="コースタイム" unit="時間" step="any" value={f.courseTimeH} onChange={(r) => set({ courseTimeH: r })} />
        <div class="field">
          <span class="label">アクセス（片道）</span>
          <div class="chips">
            {[60, 90, 120, 180].map((m) => (
              <button type="button" key={m} class={`chip ${f.accessMaxMin === m ? 'on' : ''}`} onClick={() => set({ accessMaxMin: f.accessMaxMin === m ? undefined : m })}>
                {m / 60}時間以内
              </button>
            ))}
          </div>
        </div>
        <div class="hint">数値は「代表コース」を優先し、未登録なら最新の山行記録の値を使います。</div>
      </Fold>

      <Fold title="特徴タグ" icon="🏷️" open meta={f.includeTagIds.length + f.excludeTagIds.length || ''}>
        <div class="segmented" role="group" aria-label="タグの条件">
          <button type="button" aria-pressed={f.tagMode === 'all'} onClick={() => set({ tagMode: 'all' })}>
            すべて含む (AND)
          </button>
          <button type="button" aria-pressed={f.tagMode === 'any'} onClick={() => set({ tagMode: 'any' })}>
            いずれか (OR)
          </button>
        </div>
        <TagPicker mode="filter" selected={f.includeTagIds} excluded={f.excludeTagIds} allowCreate={false} onChange={(s, e) => set({ includeTagIds: s, excludeTagIds: e })} />
      </Fold>

      <Fold title="地域・山域" icon="🗾" meta={f.regions.length + f.ranges.length + f.prefectures.length || ''}>
        <div class="field">
          <span class="label">地方</span>
          <div class="chips">
            {REGIONS.filter((r) => usedRegions.has(r.name) || f.regions.includes(r.name)).map((r) => (
              <button type="button" key={r.name} class={`chip ${f.regions.includes(r.name) ? 'on' : ''}`} onClick={() => set({ regions: toggleIn(f.regions, r.name) })}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span class="label">都道府県</span>
          <div class="chips">
            {uniq(store.state.mountains.flatMap((m) => m.prefectures)).map((p) => (
              <button type="button" key={p} class={`chip ${f.prefectures.includes(p) ? 'on' : ''}`} onClick={() => set({ prefectures: toggleIn(f.prefectures, p) })}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {ranges.length > 0 && (
          <div class="field">
            <span class="label">山域</span>
            <div class="chips">
              {ranges.map((r) => (
                <button type="button" key={r} class={`chip ${f.ranges.includes(r) ? 'on' : ''}`} onClick={() => set({ ranges: toggleIn(f.ranges, r) })}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </Fold>

      <Fold title="自分の評価" icon="📝" meta={Object.keys(f.minRatings).length + Object.keys(f.maxRatings).length || ''}>
        {RATING_DEFS.map((d) => {
          const kind = d.kind === 'burden' ? 'maxRatings' : 'minRatings';
          const cur = f[kind][d.key];
          return (
            <div class="field" key={d.key}>
              <span class="label">
                {d.label}
                <span class="hint">（{d.kind === 'burden' ? '以下' : '以上'}）</span>
              </span>
              <div class="segmented">
                {[undefined, 1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={String(n)} aria-pressed={cur === n} onClick={() => setRatingBound(kind, d.key, n)}>
                    {n ?? '—'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Fold>
    </Sheet>
  );
}

function clearPreset(id: string): Partial<MountainFilter> {
  const f = getUi().filter;
  switch (id) {
    case 'dist10':
      return { distanceKm: { ...f.distanceKm, min: undefined } };
    case 'asc1000':
      return { ascentM: { ...f.ascentM, min: undefined } };
    case 'elev2000':
      return { elevationM: { ...f.elevationM, min: undefined } };
    case 'long':
      return { courseTimeH: { ...f.courseTimeH, min: undefined } };
    case 'short':
      return { courseTimeH: { ...f.courseTimeH, max: undefined } };
    default:
      return {};
  }
}

function SortSheet({ onClose }: { onClose: () => void }) {
  const { sort } = getUi();
  return (
    <Sheet title="並び替え" onClose={onClose} testId="sort-sheet">
      <div class="segmented">
        <button type="button" aria-pressed={sort.dir === 'desc'} onClick={() => (setUi({ sort: { ...sort, dir: 'desc' } }), onClose())}>
          大きい順・新しい順
        </button>
        <button type="button" aria-pressed={sort.dir === 'asc'} onClick={() => (setUi({ sort: { ...sort, dir: 'asc' } }), onClose())}>
          小さい順・古い順
        </button>
      </div>
      <div class="option-list">
        {SORT_OPTIONS.map((o) => (
          <button
            type="button"
            key={o.key}
            class={sort.key === o.key ? 'sel' : ''}
            onClick={() => {
              setUi({ sort: { key: o.key, dir: sort.key === o.key ? sort.dir : o.defaultDir } });
              onClose();
            }}
          >
            <span class="grow">{o.label}</span>
            {sort.key === o.key && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function MountainListPage({ initialTab }: { initialTab?: 'mine' | 'search' }) {
  const store = useStore();
  const ui = useUi();
  useEffect(() => {
    if (initialTab && initialTab !== getUi().listTab) setUi({ listTab: initialTab });
  }, [initialTab]);
  const searching = ui.listTab === 'search';
  const { views, tagIndex } = store.derived;
  const [sheet, setSheet] = useState<'filter' | 'sort' | null>(null);
  const f = ui.filter;
  const ctx = useMemo(() => ({ tagsById: tagIndex.byId }), [tagIndex]);
  const results = useMemo(() => sortViews(applyFilter(views, f, ctx), ui.sort), [views, f, ctx, ui.sort]);
  const active = countActiveConditions(f);
  const statusTab = f.statuses.length === 1 ? f.statuses[0] : f.statuses.length === 0 ? 'all' : 'custom';
  const sortLabel = SORT_OPTIONS.find((o) => o.key === ui.sort.key)?.label ?? '';
  const setFilter = (patch: Partial<MountainFilter>) => setUi({ filter: { ...f, ...patch } });

  const activeChips: { key: string; label: string; remove: () => void; exclude?: boolean }[] = [];
  if (f.favoriteOnly) activeChips.push({ key: 'fav', label: '★お気に入り', remove: () => setFilter({ favoriteOnly: false }) });
  if (f.minWish) activeChips.push({ key: 'wish', label: `行きたい度${'★'.repeat(f.minWish)}以上`, remove: () => setFilter({ minWish: 0 }) });
  const rangeChip = (key: 'elevationM' | 'distanceKm' | 'ascentM' | 'courseTimeH', name: string, unit: string) => {
    const r = f[key];
    if (!isFiniteNumber(r.min) && !isFiniteNumber(r.max)) return;
    const label = `${name} ${isFiniteNumber(r.min) ? r.min : ''}〜${isFiniteNumber(r.max) ? r.max : ''}${unit}`;
    activeChips.push({ key, label, remove: () => setFilter({ [key]: {} } as Partial<MountainFilter>) });
  };
  rangeChip('elevationM', '標高', 'm');
  rangeChip('distanceKm', '距離', 'km');
  rangeChip('ascentM', '累積', 'm');
  rangeChip('courseTimeH', 'CT', 'h');
  if (isFiniteNumber(f.accessMaxMin)) activeChips.push({ key: 'access', label: `アクセス${f.accessMaxMin / 60}h以内`, remove: () => setFilter({ accessMaxMin: undefined }) });
  f.regions.forEach((r) => activeChips.push({ key: `r:${r}`, label: r, remove: () => setFilter({ regions: f.regions.filter((x) => x !== r) }) }));
  f.prefectures.forEach((r) => activeChips.push({ key: `p:${r}`, label: r, remove: () => setFilter({ prefectures: f.prefectures.filter((x) => x !== r) }) }));
  f.ranges.forEach((r) => activeChips.push({ key: `g:${r}`, label: r, remove: () => setFilter({ ranges: f.ranges.filter((x) => x !== r) }) }));
  f.includeTagIds.forEach((id) =>
    activeChips.push({ key: `t:${id}`, label: tagIndex.byId.get(id)?.label ?? id, remove: () => setFilter({ includeTagIds: f.includeTagIds.filter((x) => x !== id) }) }),
  );
  f.excludeTagIds.forEach((id) =>
    activeChips.push({ key: `x:${id}`, label: tagIndex.byId.get(id)?.label ?? id, exclude: true, remove: () => setFilter({ excludeTagIds: f.excludeTagIds.filter((x) => x !== id) }) }),
  );
  (Object.entries(f.minRatings) as [RatingKey, number][]).forEach(([k, v]) =>
    activeChips.push({ key: `min:${k}`, label: `${RATING_DEFS.find((d) => d.key === k)?.label}${v}以上`, remove: () => { const n = { ...f.minRatings }; delete n[k]; setFilter({ minRatings: n }); } }),
  );
  (Object.entries(f.maxRatings) as [RatingKey, number][]).forEach(([k, v]) =>
    activeChips.push({ key: `max:${k}`, label: `${RATING_DEFS.find((d) => d.key === k)?.label}${v}以下`, remove: () => { const n = { ...f.maxRatings }; delete n[k]; setFilter({ maxRatings: n }); } }),
  );

  const resultCount = (nf: MountainFilter) => applyFilter(views, nf, ctx).length;

  return (
    <>
      <PageHeader title="山" sub={`${views.length}座`}>
        {!searching && (
          <button class={`icon-btn ${ui.selectMode ? 'active' : ''}`} aria-label="比較する山を選ぶ" aria-pressed={ui.selectMode} onClick={() => setUi({ selectMode: !ui.selectMode })}>
            <Icon name="compare" />
          </button>
        )}
        <a class="icon-btn" href="#/mountains/new" aria-label="山を追加">
          <Icon name="plus" />
        </a>
      </PageHeader>
      <div class="page">
        <div class="segmented list-tabs" role="tablist" aria-label="表示する山">
          <button type="button" role="tab" aria-selected={!searching} aria-pressed={!searching} onClick={() => setUi({ listTab: 'mine', selectMode: false })} data-testid="tab-mine">
            自分の山
          </button>
          <button type="button" role="tab" aria-selected={searching} aria-pressed={searching} onClick={() => setUi({ listTab: 'search', selectMode: false })} data-testid="tab-search">
            <Icon name="search" size={15} /> 山を探す
          </button>
        </div>

        {searching ? (
          <MasterSearchPanel
            query={ui.masterQuery}
            onQuery={(q) => setUi({ masterQuery: q })}
            prefectures={ui.masterPrefectures}
            onPrefectures={(p) => setUi({ masterPrefectures: p })}
          />
        ) : (
        <>
        <div class="search-bar">
          <label class="search-box">
            <Icon name="search" size={19} />
            <input
              type="search"
              value={f.text}
              placeholder="山名・山域・タグで検索"
              aria-label="山を検索"
              onInput={(e) => setFilter({ text: (e.target as HTMLInputElement).value })}
            />
            {f.text && (
              <button type="button" class="icon-btn" aria-label="検索をクリア" onClick={() => setFilter({ text: '' })}>
                <Icon name="x" size={18} />
              </button>
            )}
          </label>
          <button class="btn filter-btn" onClick={() => setSheet('filter')} aria-label="絞り込み条件" data-testid="open-filter">
            <Icon name="filter" size={18} />
            絞り込み
            {active > 0 && <span class="badge-dot">{active}</span>}
          </button>
        </div>

        <div class="segmented" role="group" aria-label="登頂状況">
          {STATUS_TABS.map((t) => (
            <button
              type="button"
              key={t.value}
              aria-pressed={statusTab === t.value}
              onClick={() => setFilter({ statuses: t.value === 'all' ? [] : [t.value as MountainStatus] })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div class="chips scroll" aria-label="クイック条件">
          {QUICK_NUMERIC_PRESETS.map((p) => (
            <button type="button" key={p.id} class={`chip ${p.isActive(f) ? 'on' : ''}`} aria-pressed={p.isActive(f)} onClick={() => setUi({ filter: p.isActive(f) ? { ...f, ...clearPreset(p.id) } : p.apply(f) })}>
              {p.label}
            </button>
          ))}
        </div>

        {activeChips.length > 0 && (
          <div class="chips" data-testid="active-filters">
            {activeChips
              .filter((c) => !['elevationM', 'distanceKm', 'ascentM', 'courseTimeH'].includes(c.key) || !QUICK_NUMERIC_PRESETS.some((p) => p.isActive(f)))
              .map((c) => (
                <button type="button" key={c.key} class={`chip ${c.exclude ? 'exclude' : 'on'}`} onClick={c.remove} aria-label={`${c.label}の条件を外す`}>
                  {c.exclude ? '除外: ' : ''}
                  {c.label}
                  <Icon name="x" size={14} class="x" />
                </button>
              ))}
            <button type="button" class="chip" onClick={() => setUi({ filter: { ...emptyFilter(), text: f.text, statuses: f.statuses } })}>
              条件をクリア
            </button>
          </div>
        )}

        <div class="result-meta">
          <span data-testid="result-count">{results.length}座</span>
          <button type="button" onClick={() => setSheet('sort')} data-testid="open-sort">
            <Icon name="sort" size={16} />
            {sortLabel}（{ui.sort.dir === 'desc' ? '降順' : '昇順'}）
          </button>
        </div>

        {ui.selectMode && (
          <div class="info-box">比較したい山を最大{MAX_COMPARE}座までタップして選んでください。</div>
        )}

        <div class="list" data-testid="mountain-list">
          {results.map((v) => (
            <MountainCard
              key={v.mountain.id}
              view={v}
              index={tagIndex}
              selectable={ui.selectMode}
              selected={ui.compareIds.includes(v.mountain.id)}
              onSelect={() => {
                if (!toggleCompare(v.mountain.id)) toast(`比較は最大${MAX_COMPARE}座までです`);
              }}
              onToggleFavorite={() => store.patchMountain(v.mountain.id, { favorite: !v.mountain.favorite })}
            />
          ))}
        </div>

        {results.length === 0 && views.length > 0 && (
          <Empty icon="🔍">
            条件に合う山がありません。
            <br />
            <button class="btn small" style={{ marginTop: '10px' }} onClick={() => setUi({ filter: emptyFilter() })}>
              条件をすべて解除
            </button>
          </Empty>
        )}
        {views.length === 0 && (
          <Empty>
            まだ山が登録されていません。
            <br />
            <button class="btn primary small" style={{ marginTop: '10px' }} onClick={() => setUi({ listTab: 'search' })}>
              山名データから探す
            </button>
            <a class="btn small" style={{ marginTop: '10px', marginLeft: '6px' }} href="#/mountains/new">
              手入力で登録
            </a>
          </Empty>
        )}
        </>
        )}
      </div>

      {!searching && (ui.selectMode || ui.compareIds.length > 0) ? (
        <div class="floating-bar" data-testid="compare-bar">
          <span class="fb-text">{ui.compareIds.length}座を選択中</span>
          {ui.compareIds.length > 0 && (
            <button class="btn ghost small" onClick={() => setUi({ compareIds: [] })}>
              クリア
            </button>
          )}
          <button class="btn primary small" disabled={ui.compareIds.length < 2} onClick={() => navigate('/compare')}>
            比較する
          </button>
        </div>
      ) : searching ? null : (
        <a class="fab" href="#/mountains/new" aria-label="山を追加">
          <Icon name="plus" size={28} />
        </a>
      )}

      {sheet === 'filter' && <FilterSheet onClose={() => setSheet(null)} resultCount={resultCount} />}
      {sheet === 'sort' && <SortSheet onClose={() => setSheet(null)} />}
    </>
  );
}
