import { useMemo, useState } from 'preact/hooks';
import { DANGER_CATEGORY_KEYS, categoryId } from '../../domain/presets';
import { createCustomTag, findDuplicateTag, groupTagIds, tagMatchesQuery, type TagIndex } from '../../domain/tags';
import type { ID, Tag } from '../../domain/types';
import { useStore } from '../../state/hooks';
import { Fold } from './common';
import { Icon } from './Icon';
import { toast } from './overlay';

const DANGER_CATS = new Set(DANGER_CATEGORY_KEYS.map(categoryId));

/** タグをカテゴリごとに表示 */
export function TagGroups({ tagIds, index, empty = 'タグはまだありません' }: { tagIds: Iterable<ID>; index: TagIndex; empty?: string }) {
  const groups = groupTagIds([...tagIds], index);
  if (!groups.length) return <div class="hint">{empty}</div>;
  return (
    <div class="tag-groups">
      {groups.map((g) => (
        <div class="tag-group" key={g.category.id}>
          <div class="g-name">
            {g.category.icon} {g.category.name}
          </div>
          <div class="tags">
            {g.tags.map((t) => (
              <span class={`tag ${g.category.id === 'cat.danger' ? 'danger' : ''}`} key={t.id}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** カード用: 主要カテゴリから数個だけ */
export function TagLine({ tagIds, index, max = 5 }: { tagIds: Iterable<ID>; index: TagIndex; max?: number }) {
  const groups = groupTagIds([...tagIds], index);
  const prefer = ['cat.terrain', 'cat.scenery', 'cat.technical', 'cat.after', 'cat.style', 'cat.title'];
  const picked: Tag[] = [];
  for (const cid of prefer) {
    const g = groups.find((x) => x.category.id === cid);
    if (g) picked.push(...g.tags.slice(0, 2));
  }
  const shown = picked.slice(0, max);
  const total = groups.reduce((a, g) => a + g.tags.length, 0);
  return (
    <>
      {shown.map((t) => (
        <span class={`tag ${DANGER_CATS.has(t.categoryId) && t.categoryId === 'cat.danger' ? 'danger' : ''}`} key={t.id}>
          {t.label}
        </span>
      ))}
      {total > shown.length && <span class="tag">+{total - shown.length}</span>}
    </>
  );
}

type TriState = 'include' | 'exclude';

interface PickerProps {
  /** select: 通常の複数選択 / filter: 含む→除外→解除 の3段階 */
  mode: 'select' | 'filter';
  selected: ID[];
  excluded?: ID[];
  onChange: (selected: ID[], excluded: ID[]) => void;
  /** 自由にタグを追加できるか */
  allowCreate?: boolean;
  /** 最初に開いておくカテゴリ */
  openCategoryIds?: ID[];
}

/**
 * カテゴリ別の折りたたみ＋検索付きのタグ選択。
 * どのカテゴリにもその場でカスタムタグを追加できる。
 */
export function TagPicker({ mode, selected, excluded = [], onChange, allowCreate = true, openCategoryIds = [] }: PickerProps) {
  const store = useStore();
  const index = store.derived.tagIndex;
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<ID | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const sel = useMemo(() => new Set(selected), [selected]);
  const exc = useMemo(() => new Set(excluded), [excluded]);

  const stateOf = (id: ID): TriState | undefined => (sel.has(id) ? 'include' : exc.has(id) ? 'exclude' : undefined);

  const toggle = (id: ID) => {
    const s = stateOf(id);
    if (mode === 'select') {
      onChange(s ? selected.filter((x) => x !== id) : [...selected, id], excluded);
      return;
    }
    if (!s) onChange([...selected, id], excluded);
    else if (s === 'include') onChange(selected.filter((x) => x !== id), [...excluded, id]);
    else onChange(selected, excluded.filter((x) => x !== id));
  };

  const addTag = async (catId: ID) => {
    const label = newLabel.trim();
    if (!label) return;
    const dup = findDuplicateTag(catId, label, store.state.tags);
    if (dup) {
      if (dup.hidden) await store.restoreTag(dup.id);
      if (!sel.has(dup.id)) onChange([...selected, dup.id], excluded);
      toast(`「${dup.label}」を選択しました`);
    } else {
      const tag = await store.saveTag(createCustomTag(catId, label, store.state.tags));
      onChange([...selected, tag.id], excluded);
      toast(`タグ「${tag.label}」を追加しました`);
    }
    setNewLabel('');
    setAdding(null);
  };

  const q = query.trim();
  return (
    <div class="tag-picker" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div class="search-box tp-search">
        <Icon name="search" size={18} />
        <input value={query} placeholder="タグを検索（例: 鎖場、温泉）" onInput={(e) => setQuery((e.target as HTMLInputElement).value)} aria-label="タグを検索" />
        {query && (
          <button type="button" class="icon-btn" onClick={() => setQuery('')} aria-label="検索をクリア">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      {mode === 'filter' && <div class="tp-legend">タップするたびに「含む」→「除外」→「解除」と切り替わります。</div>}
      {index.categories.map((cat) => {
        const tags = (index.tagsByCategory.get(cat.id) ?? []).filter((t) => tagMatchesQuery(t, q));
        if (q && tags.length === 0) return null;
        const count = (index.tagsByCategory.get(cat.id) ?? []).filter((t) => sel.has(t.id) || exc.has(t.id)).length;
        return (
          <Fold
            key={cat.id + (q ? ':q' : '')}
            inner
            class="tp-cat"
            title={cat.name}
            icon={cat.icon}
            meta={count ? `${count}件選択` : ''}
            open={!!q || openCategoryIds.includes(cat.id)}
            testId={`tagcat-${cat.id}`}
          >
            <div class="chips">
              {tags.map((t) => {
                const s = stateOf(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    class={`chip ${s === 'include' ? 'on' : s === 'exclude' ? 'exclude' : ''}`}
                    aria-pressed={s === 'include' ? 'true' : s === 'exclude' ? 'mixed' : 'false'}
                    onClick={() => toggle(t.id)}
                  >
                    {s === 'include' && <Icon name="check" size={14} strokeWidth={2.6} />}
                    {t.label}
                  </button>
                );
              })}
              {allowCreate && adding !== cat.id && (
                <button type="button" class="chip add" onClick={() => (setAdding(cat.id), setNewLabel(q))}>
                  <Icon name="plus" size={15} />
                  追加
                </button>
              )}
            </div>
            {adding === cat.id && (
              <div class="tp-add">
                <input
                  class="input"
                  value={newLabel}
                  autoFocus
                  placeholder={`${cat.name}に新しいタグ`}
                  aria-label="新しいタグ名"
                  onInput={(e) => setNewLabel((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addTag(cat.id))}
                />
                <button type="button" class="btn small primary" onClick={() => void addTag(cat.id)}>
                  追加
                </button>
                <button type="button" class="btn small ghost" onClick={() => setAdding(null)}>
                  取消
                </button>
              </div>
            )}
          </Fold>
        );
      })}
    </div>
  );
}
