import { useMemo, useState } from 'preact/hooks';
import { countTagUsage, createCustomCategory, createCustomTag, findDuplicateTag, sortCategories, sortTags } from '../../domain/tags';
import type { Tag, TagCategory } from '../../domain/types';
import { useStore } from '../../state/hooks';
import { Fold, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { confirmDialog, Sheet, toast } from '../components/overlay';

type Editing = { kind: 'tag'; tag: Tag } | { kind: 'category'; category: TagCategory } | { kind: 'newCategory' };

function EditSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const store = useStore();
  const initial = editing.kind === 'tag' ? editing.tag.label : editing.kind === 'category' ? editing.category.name : '';
  const [label, setLabel] = useState(initial);
  const [aliases, setAliases] = useState(editing.kind === 'tag' ? (editing.tag.aliases ?? []).join('、') : '');
  const [icon, setIcon] = useState(editing.kind === 'category' ? editing.category.icon ?? '' : '🏷️');
  const [categoryId, setCategoryId] = useState(editing.kind === 'tag' ? editing.tag.categoryId : '');
  const cats = sortCategories(store.state.tagCategories.filter((c) => !c.hidden));

  const save = async () => {
    const name = label.trim();
    if (!name) return toast('名前を入力してください', 'error');
    if (editing.kind === 'tag') {
      const dup = findDuplicateTag(categoryId, name, store.state.tags);
      if (dup && dup.id !== editing.tag.id) return toast('同じカテゴリに同名のタグがあります', 'error');
      const al = aliases.split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);
      await store.saveTag({ ...editing.tag, label: name, categoryId, aliases: al.length ? al : undefined });
    } else if (editing.kind === 'category') {
      await store.saveCategory({ ...editing.category, name, icon: icon || undefined });
    } else {
      await store.saveCategory(createCustomCategory(name, store.state.tagCategories, icon || '🏷️'));
    }
    toast('保存しました');
    onClose();
  };

  const title = editing.kind === 'tag' ? 'タグを編集' : editing.kind === 'category' ? 'カテゴリを編集' : 'カテゴリを追加';
  return (
    <Sheet
      title={title}
      onClose={onClose}
      testId="tag-edit-sheet"
      footer={
        <>
          <button class="btn" onClick={onClose}>
            キャンセル
          </button>
          <button class="btn primary" onClick={save} data-testid="save-tag">
            保存
          </button>
        </>
      }
    >
      <div class="field">
        <label for="te-name">名前</label>
        <input id="te-name" class="input" value={label} autoFocus onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
      </div>
      {editing.kind === 'tag' && (
        <>
          <div class="field">
            <label for="te-cat">カテゴリ</label>
            <select id="te-cat" class="select" value={categoryId} onChange={(e) => setCategoryId((e.target as HTMLSelectElement).value)}>
              {cats.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="te-alias">別名（検索用、読点区切り）</label>
            <input id="te-alias" class="input" value={aliases} placeholder="例: 日帰り湯、立ち寄り湯" onInput={(e) => setAliases((e.target as HTMLInputElement).value)} />
          </div>
          {editing.tag.builtin && <div class="hint">プリセットのタグです。名前を変えても、提案ルールなどとの関連は保たれます。</div>}
        </>
      )}
      {editing.kind !== 'tag' && (
        <div class="field">
          <label for="te-icon">アイコン（絵文字）</label>
          <input id="te-icon" class="input" value={icon} maxLength={4} onInput={(e) => setIcon((e.target as HTMLInputElement).value)} />
        </div>
      )}
    </Sheet>
  );
}

export function TagManagerPage() {
  const store = useStore();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newTag, setNewTag] = useState<Record<string, string>>({});
  const usage = useMemo(() => countTagUsage(store.state.mountains, store.state.records), [store.state.mountains, store.state.records]);
  const cats = sortCategories(store.state.tagCategories);
  const visibleCats = cats.filter((c) => !c.hidden);
  const hiddenCats = cats.filter((c) => c.hidden);

  const addTag = async (cat: TagCategory) => {
    const label = (newTag[cat.id] ?? '').trim();
    if (!label) return;
    const dup = findDuplicateTag(cat.id, label, store.state.tags);
    if (dup) {
      if (dup.hidden) {
        await store.restoreTag(dup.id);
        toast(`「${dup.label}」を再表示しました`);
      } else toast('同名のタグが既にあります', 'error');
    } else {
      await store.saveTag(createCustomTag(cat.id, label, store.state.tags));
      toast(`「${label}」を追加しました`);
    }
    setNewTag({ ...newTag, [cat.id]: '' });
  };

  const removeTag = async (t: Tag) => {
    const n = usage.get(t.id) ?? 0;
    const ok = await confirmDialog({
      title: `タグ「${t.label}」を削除しますか？`,
      message: `${n ? `${n}件の山・記録から外れます。\n` : ''}${t.builtin ? 'プリセットのタグは非表示になり、あとで復元できます。' : 'この操作は元に戻せません。'}`,
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    await store.removeTag(t.id);
    toast('削除しました');
  };

  const removeCategory = async (c: TagCategory) => {
    const tags = store.state.tags.filter((t) => t.categoryId === c.id);
    const ok = await confirmDialog({
      title: `カテゴリ「${c.name}」を${c.builtin ? '非表示に' : '削除'}しますか？`,
      message: c.builtin ? 'プリセットのカテゴリは非表示になります（タグ付けは保持され、あとで復元できます）。' : `含まれるタグ${tags.length}件も削除され、山・記録から外れます。`,
      okLabel: c.builtin ? '非表示にする' : '削除',
      danger: true,
    });
    if (!ok) return;
    await store.removeCategory(c.id);
    toast(c.builtin ? '非表示にしました' : '削除しました');
  };

  return (
    <>
      <PageHeader title="タグとカテゴリ" back="/settings">
        <button class="icon-btn" aria-label="カテゴリを追加" onClick={() => setEditing({ kind: 'newCategory' })}>
          <Icon name="plus" />
        </button>
      </PageHeader>
      <div class="page">
        <div class="hint">
          山の特徴はカテゴリごとのタグで表現します。プリセットの名前変更・非表示、自分用のタグやカテゴリの追加が自由にできます。
        </div>
        {visibleCats.map((c, ci) => {
          const tags = sortTags(store.state.tags.filter((t) => t.categoryId === c.id));
          const visible = tags.filter((t) => !t.hidden);
          return (
            <Fold key={c.id} title={c.name} icon={c.icon} meta={`${visible.length}`} testId={`tm-${c.id}`}>
              <div class="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button class="btn small ghost" aria-label="上へ" disabled={ci === 0} onClick={() => store.moveCategory(c.id, -1)}>
                  <Icon name="arrowUp" size={16} />
                </button>
                <button class="btn small ghost" aria-label="下へ" disabled={ci === visibleCats.length - 1} onClick={() => store.moveCategory(c.id, 1)}>
                  <Icon name="arrowDown" size={16} />
                </button>
                <button class="btn small" onClick={() => setEditing({ kind: 'category', category: c })}>
                  名前変更
                </button>
                <button class="btn small danger" onClick={() => removeCategory(c)}>
                  {c.builtin ? '非表示' : '削除'}
                </button>
              </div>
              <div>
                {tags.map((t) => (
                  <div class={`tm-tag ${t.hidden ? 'hidden-tag' : ''}`} key={t.id}>
                    <span class="tm-label">
                      {t.label}
                      {!t.builtin && <span class="builtin">カスタム</span>}
                      {t.aliases?.length ? <span class="builtin">別名: {t.aliases.join('、')}</span> : null}
                    </span>
                    {(usage.get(t.id) ?? 0) > 0 && <span class="pill-count">{usage.get(t.id)}</span>}
                    {t.hidden ? (
                      <button class="btn small" onClick={() => store.restoreTag(t.id)}>
                        復元
                      </button>
                    ) : (
                      <>
                        <button class="icon-btn" aria-label={`${t.label}を編集`} onClick={() => setEditing({ kind: 'tag', tag: t })}>
                          <Icon name="edit" size={18} />
                        </button>
                        <button class="icon-btn" aria-label={`${t.label}を削除`} onClick={() => removeTag(t)}>
                          <Icon name="trash" size={18} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div class="tp-add">
                <input
                  class="input"
                  placeholder="新しいタグ名"
                  aria-label={`${c.name}に新しいタグ`}
                  value={newTag[c.id] ?? ''}
                  onInput={(e) => setNewTag({ ...newTag, [c.id]: (e.target as HTMLInputElement).value })}
                  onKeyDown={(e) => e.key === 'Enter' && void addTag(c)}
                />
                <button class="btn small primary" onClick={() => addTag(c)}>
                  追加
                </button>
              </div>
            </Fold>
          );
        })}
        <button class="btn" onClick={() => setEditing({ kind: 'newCategory' })} data-testid="add-category">
          <Icon name="plus" size={18} />
          カテゴリを追加
        </button>
        {hiddenCats.length > 0 && (
          <Fold title="非表示のカテゴリ" icon="🙈" meta={`${hiddenCats.length}`}>
            {hiddenCats.map((c) => (
              <div class="tm-tag" key={c.id}>
                <span class="tm-label">
                  {c.icon} {c.name}
                </span>
                <button class="btn small" onClick={() => store.restoreCategory(c.id)}>
                  復元
                </button>
              </div>
            ))}
          </Fold>
        )}
      </div>
      {editing && <EditSheet editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
