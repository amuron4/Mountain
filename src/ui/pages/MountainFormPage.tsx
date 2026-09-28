import { useState } from 'preact/hooks';
import { RANGE_SUGGESTIONS, REGIONS, regionOfPrefecture } from '../../domain/geo';
import { createCourse, createMountain, STATUS_LABEL } from '../../domain/mountain';
import type { Course, Mountain, MountainStatus } from '../../domain/types';
import { uniq } from '../../domain/util';
import { useStore } from '../../state/hooks';
import { goBack, navigate } from '../../state/router';
import { Empty, Fold, PageHeader, Segmented } from '../components/common';
import { DurationField, NumberField, PrefecturePicker, RatingsEditor, TextArea, TextField, Toggle, WishInput } from '../components/fields';
import { Icon } from '../components/Icon';
import { toast } from '../components/overlay';
import { TagPicker } from '../components/tags';

function CourseEditor({ course, index, onChange, onRemove, onMakePrimary }: { course: Course; index: number; onChange: (c: Course) => void; onRemove: () => void; onMakePrimary?: () => void }) {
  const set = (patch: Partial<Course>) => onChange({ ...course, ...patch });
  return (
    <div class="course-card" data-testid="course-editor">
      <div class="cc-head">
        <span class="grow">{index === 0 ? '代表コース' : `コース ${index + 1}`}</span>
        {onMakePrimary && (
          <button type="button" class="btn small ghost" onClick={onMakePrimary}>
            代表にする
          </button>
        )}
        <button type="button" class="icon-btn" aria-label="このコースを削除" onClick={onRemove}>
          <Icon name="trash" size={18} />
        </button>
      </div>
      <TextField label="コース名" value={course.name} onInput={(v) => set({ name: v })} placeholder="例: 大倉尾根ピストン" name={`course-${index}-name`} />
      <div class="grid-2">
        <TextField label="スタート" value={course.start ?? ''} onInput={(v) => set({ start: v || undefined })} placeholder="登山口・駅" />
        <TextField label="ゴール" value={course.goal ?? ''} onInput={(v) => set({ goal: v || undefined })} placeholder="下山口・駅" />
      </div>
      <div class="grid-2">
        <NumberField label="距離" unit="km" decimal value={course.distanceKm} onChange={(v) => set({ distanceKm: v })} name={`course-${index}-distance`} />
        <DurationField label="標準コースタイム" value={course.courseTimeMin} onChange={(v) => set({ courseTimeMin: v })} name={`course-${index}-ct`} />
      </div>
      <div class="grid-2">
        <NumberField label="累積登り" unit="m" value={course.ascentM} onChange={(v) => set({ ascentM: v })} name={`course-${index}-ascent`} />
        <NumberField label="累積下り" unit="m" value={course.descentM} onChange={(v) => set({ descentM: v })} name={`course-${index}-descent`} />
      </div>
      <TextField label="メモ" value={course.note ?? ''} onInput={(v) => set({ note: v || undefined })} placeholder="出典・注意点など" />
    </div>
  );
}

export function MountainFormPage({ id }: { id?: string }) {
  const store = useStore();
  const existing = id ? store.derived.mountainById.get(id) : undefined;
  const [m, setM] = useState<Mountain>(() => (existing ? structuredClone(existing) : createMountain({ courses: [createCourse()] })));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Mountain>) => setM((cur) => ({ ...cur, ...patch }));
  const ranges = uniq([...store.state.mountains.map((x) => x.range).filter(Boolean), ...RANGE_SUGGESTIONS]);

  if (id && !existing) {
    return (
      <>
        <PageHeader title="山を編集" back="/mountains" />
        <div class="page">
          <Empty icon="❓">この山は見つかりませんでした。</Empty>
        </div>
      </>
    );
  }

  const updateCourse = (i: number, c: Course) => set({ courses: m.courses.map((x, j) => (j === i ? c : x)) });

  const save = async (e?: Event) => {
    e?.preventDefault();
    if (!m.name.trim()) {
      setError('山名を入力してください');
      document.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }
    const dup = store.state.mountains.find((x) => x.id !== m.id && x.name.trim() === m.name.trim() && (x.prefectures[0] ?? '') === (m.prefectures[0] ?? ''));
    if (dup && !existing) {
      // 同名の山は各地にあるので保存は許可し、気付けるように知らせるだけ
      toast(`同じ名前の山「${dup.name}」が既にあります`);
    }
    setSaving(true);
    const region = m.region || (m.prefectures[0] ? regionOfPrefecture(m.prefectures[0]) ?? '' : '');
    // 空のコースは保存しない
    const courses = m.courses.filter((c) => c.name || c.start || c.goal || c.distanceKm !== undefined || c.ascentM !== undefined || c.courseTimeMin !== undefined);
    const saved = await store.saveMountain({ ...m, region, courses });
    toast(existing ? '保存しました' : `「${saved.name}」を登録しました`);
    if (existing) goBack(`/mountains/${saved.id}`);
    else navigate(`/mountains/${saved.id}`, { replace: true });
  };

  const tagCount = m.tagIds.length;
  const ratingCount = Object.keys(m.ratings).length;

  return (
    <>
      <PageHeader title={existing ? `${existing.name}を編集` : '山を登録'} back={existing ? `/mountains/${existing.id}` : '/mountains'} />
      <form class="page form" onSubmit={save} data-testid="mountain-form">
        <Fold title="基本情報" icon="⛰️" open>
          <TextField label="山名" required name="name" value={m.name} onInput={(v) => (set({ name: v }), setError(''))} placeholder="例: 蛭ヶ岳" />
          {error && <div class="error-text">{error}</div>}
          <div class="grid-2">
            <TextField label="読み" name="kana" value={m.kana} onInput={(v) => set({ kana: v })} placeholder="ひるがたけ" />
            <NumberField label="標高" unit="m" name="elevation" value={m.elevationM} onChange={(v) => set({ elevationM: v })} placeholder="1673" />
          </div>
          <PrefecturePicker
            value={m.prefectures}
            onChange={(prefs) => set({ prefectures: prefs, region: m.region || (prefs[0] ? regionOfPrefecture(prefs[0]) ?? '' : '') })}
          />
          <div class="grid-2">
            <div class="field">
              <label for="region">地方</label>
              <select id="region" class="select" value={m.region} onChange={(e) => set({ region: (e.target as HTMLSelectElement).value })}>
                <option value="">（自動）</option>
                {REGIONS.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField label="山域" name="range" value={m.range} onInput={(v) => set({ range: v })} placeholder="丹沢" list="range-list" />
          </div>
          <datalist id="range-list">
            {ranges.map((r) => (
              <option value={r} key={r} />
            ))}
          </datalist>
        </Fold>

        <Fold title="状況・行きたい度" icon="🚩" open meta={STATUS_LABEL[m.status]}>
          <Segmented<MountainStatus>
            label="登頂状況"
            value={m.status}
            onChange={(s) => set({ status: s })}
            options={(['unclimbed', 'climbed', 'revisit'] as MountainStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
          <WishInput value={m.wish} onChange={(v) => set({ wish: v })} />
          <Toggle label="お気に入り" checked={m.favorite} onChange={(v) => set({ favorite: v })} name="favorite" />
        </Fold>

        <Fold title="コース（数値）" icon="📏" open={!existing || m.courses.length > 0} meta={m.courses.length ? `${m.courses.length}件` : '未登録'} testId="fold-courses">
          <div class="hint">距離・累積標高・コースタイムは検索・比較・提案に使われます。先頭のコースが代表になります。</div>
          {m.courses.map((c, i) => (
            <CourseEditor
              key={c.id}
              course={c}
              index={i}
              onChange={(nc) => updateCourse(i, nc)}
              onRemove={() => set({ courses: m.courses.filter((_, j) => j !== i) })}
              onMakePrimary={i > 0 ? () => set({ courses: [c, ...m.courses.filter((_, j) => j !== i)] }) : undefined}
            />
          ))}
          <button type="button" class="btn" onClick={() => set({ courses: [...m.courses, createCourse()] })} data-testid="add-course">
            <Icon name="plus" size={18} />
            {m.courses.length ? '別のコースを追加' : 'コースを追加'}
          </button>
        </Fold>

        <Fold title="アクセス" icon="🚃" meta={m.accessMinutes !== undefined ? '' : '未登録'}>
          <DurationField label="自宅からの片道時間（目安）" value={m.accessMinutes} onChange={(v) => set({ accessMinutes: v })} hint="「近場」の判定や比較に使います" name="access" />
          <TextArea label="アクセスメモ" rows={2} value={m.accessNote ?? ''} onInput={(v) => set({ accessNote: v || undefined })} placeholder="例: 渋沢駅からバス15分。始発バス 7:05" />
          <div class="hint">「公共交通向き」「駐車場あり」などはタグの「アクセス」カテゴリで設定できます。</div>
        </Fold>

        <Fold title="特徴タグ" icon="🏷️" meta={tagCount ? `${tagCount}件` : '未設定'} testId="fold-tags">
          <TagPicker mode="select" selected={m.tagIds} onChange={(s) => set({ tagIds: s })} openCategoryIds={['cat.terrain']} />
        </Fold>

        <Fold title={m.status === 'unclimbed' ? '評価（予想）' : '評価'} icon="📝" meta={ratingCount ? `${ratingCount}項目` : '未評価'}>
          <div class="hint">
            {m.status === 'unclimbed' ? '未踏の山は、調べた情報からの予想で入力しておくと比較や提案に使えます。' : '未入力の項目は山行記録の評価の平均が使われます。'}
          </div>
          <RatingsEditor value={m.ratings} onChange={(r) => set({ ratings: r })} />
        </Fold>

        <Fold title="メモ・リンク" icon="🗒️" meta={m.memo || m.links.length ? '' : '未入力'}>
          <TextArea label="メモ" name="memo" value={m.memo} onInput={(v) => set({ memo: v })} rows={5} placeholder="気になっている理由、計画のアイデアなど" />
          {m.links.map((l, i) => (
            <div class="field-row" key={i}>
              <TextField label="リンク名" value={l.label} onInput={(v) => set({ links: m.links.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
              <TextField label="URL" type="url" value={l.url} onInput={(v) => set({ links: m.links.map((x, j) => (j === i ? { ...x, url: v } : x)) })} />
              <button type="button" class="icon-btn" aria-label="リンクを削除" onClick={() => set({ links: m.links.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
          <button type="button" class="btn small" onClick={() => set({ links: [...m.links, { label: '', url: '' }] })}>
            <Icon name="plus" size={16} />
            リンクを追加
          </button>
        </Fold>

        <div class="save-bar">
          <button type="button" class="btn" onClick={() => goBack(existing ? `/mountains/${existing.id}` : '/mountains')}>
            キャンセル
          </button>
          <button type="submit" class="btn primary" disabled={saving} data-testid="save-mountain">
            <Icon name="check" size={18} />
            保存
          </button>
        </div>
      </form>
    </>
  );
}
