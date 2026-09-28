import { PRESET_CATEGORIES, categoryId, presetTagId } from './presets';
import type { ClimbRecord, ID, Mountain, Tag, TagCategory } from './types';
import { newId, normalizeText, nowIso } from './util';

/** プリセット定義から TagCategory / Tag エンティティを生成する */
export function buildPresetEntities(now = nowIso()): { categories: TagCategory[]; tags: Tag[] } {
  const categories: TagCategory[] = [];
  const tags: Tag[] = [];
  PRESET_CATEGORIES.forEach((c, ci) => {
    categories.push({
      id: categoryId(c.key),
      name: c.name,
      icon: c.icon,
      description: c.description,
      order: (ci + 1) * 10,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    });
    c.tags.forEach(([key, label, aliases], ti) => {
      tags.push({
        id: presetTagId(c.key, key),
        categoryId: categoryId(c.key),
        label,
        aliases,
        order: (ti + 1) * 10,
        builtin: true,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  return { categories, tags };
}

/**
 * 既存データに不足しているプリセットだけを返す（ユーザーが編集・非表示にしたものは上書きしない）。
 * プリセットを削除した場合は hidden で残しているため、ここで再追加されることはない。
 */
export function missingPresets(
  existingCategories: TagCategory[],
  existingTags: Tag[],
  now = nowIso(),
): { categories: TagCategory[]; tags: Tag[] } {
  const preset = buildPresetEntities(now);
  const catIds = new Set(existingCategories.map((c) => c.id));
  const tagIds = new Set(existingTags.map((t) => t.id));
  return {
    categories: preset.categories.filter((c) => !catIds.has(c.id)),
    tags: preset.tags.filter((t) => !tagIds.has(t.id)),
  };
}

export function sortCategories(cats: TagCategory[]): TagCategory[] {
  return [...cats].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'));
}

export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ja'));
}

export interface TagIndex {
  byId: Map<ID, Tag>;
  categoryById: Map<ID, TagCategory>;
  /** 表示中のカテゴリ（順序付き） */
  categories: TagCategory[];
  /** カテゴリごとの表示中タグ（順序付き） */
  tagsByCategory: Map<ID, Tag[]>;
}

export function buildTagIndex(categories: TagCategory[], tags: Tag[]): TagIndex {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const visibleCats = sortCategories(categories.filter((c) => !c.hidden));
  const tagsByCategory = new Map<ID, Tag[]>();
  for (const c of visibleCats) tagsByCategory.set(c.id, []);
  for (const t of sortTags(tags)) {
    if (t.hidden) continue;
    tagsByCategory.get(t.categoryId)?.push(t);
  }
  return { byId, categoryById, categories: visibleCats, tagsByCategory };
}

/** タグID群をカテゴリごとにまとめる（表示用、非表示タグ・不明タグは除外） */
export function groupTagIds(tagIds: ID[], index: TagIndex): { category: TagCategory; tags: Tag[] }[] {
  const groups = new Map<ID, Tag[]>();
  for (const id of tagIds) {
    const t = index.byId.get(id);
    if (!t || t.hidden) continue;
    const c = index.categoryById.get(t.categoryId);
    if (!c || c.hidden) continue;
    if (!groups.has(c.id)) groups.set(c.id, []);
    groups.get(c.id)!.push(t);
  }
  return index.categories
    .filter((c) => groups.has(c.id))
    .map((c) => ({ category: c, tags: sortTags(groups.get(c.id)!) }));
}

export function tagMatchesQuery(tag: Tag, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return [tag.label, ...(tag.aliases ?? [])].some((s) => normalizeText(s).includes(q));
}

export function createCustomTag(categoryId: ID, label: string, existing: Tag[]): Tag {
  const now = nowIso();
  const maxOrder = Math.max(0, ...existing.filter((t) => t.categoryId === categoryId).map((t) => t.order));
  return {
    id: newId('tag'),
    categoryId,
    label: label.trim(),
    order: maxOrder + 10,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createCustomCategory(name: string, existing: TagCategory[], icon = '🏷️'): TagCategory {
  const now = nowIso();
  const maxOrder = Math.max(0, ...existing.map((c) => c.order));
  return {
    id: newId('cat'),
    name: name.trim(),
    icon,
    order: maxOrder + 10,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 同じカテゴリに同名タグがあるか */
export function findDuplicateTag(categoryId: ID, label: string, tags: Tag[]): Tag | undefined {
  const n = normalizeText(label);
  return tags.find((t) => t.categoryId === categoryId && normalizeText(t.label) === n);
}

/**
 * タグ削除時の影響: 参照している山・山行記録からタグを外した更新版を返す。
 * プリセットタグは hidden にする（再シードで復活しないように）。カスタムタグは完全削除。
 */
export function planTagRemoval(
  tag: Tag,
  mountains: Mountain[],
  records: ClimbRecord[],
): { hideTag?: Tag; deleteTagId?: ID; mountains: Mountain[]; records: ClimbRecord[] } {
  const now = nowIso();
  const ms = mountains
    .filter((m) => m.tagIds.includes(tag.id))
    .map((m) => ({ ...m, tagIds: m.tagIds.filter((id) => id !== tag.id), updatedAt: now }));
  const rs = records
    .filter((r) => r.tagIds.includes(tag.id))
    .map((r) => ({ ...r, tagIds: r.tagIds.filter((id) => id !== tag.id), updatedAt: now }));
  if (tag.builtin) return { hideTag: { ...tag, hidden: true, updatedAt: now }, mountains: ms, records: rs };
  return { deleteTagId: tag.id, mountains: ms, records: rs };
}

/** タグの使用数（山＋山行記録） */
export function countTagUsage(mountains: Mountain[], records: ClimbRecord[]): Map<ID, number> {
  const counts = new Map<ID, number>();
  const add = (id: ID) => counts.set(id, (counts.get(id) ?? 0) + 1);
  mountains.forEach((m) => m.tagIds.forEach(add));
  records.forEach((r) => r.tagIds.forEach(add));
  return counts;
}
