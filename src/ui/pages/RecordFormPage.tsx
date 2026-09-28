import { useMemo, useState } from 'preact/hooks';
import { formatDuration } from '../../domain/format';
import { computePace, createRecord, CROWD_OPTIONS, describePace, TRAIL_OPTIONS, TRANSPORT_OPTIONS, WEATHER_OPTIONS } from '../../domain/record';
import type { ClimbRecord } from '../../domain/types';
import { useStore } from '../../state/hooks';
import { goBack, navigate } from '../../state/router';
import { Empty, Fold, PageHeader } from '../components/common';
import { ChipChoice, DurationField, NumberField, RatingsEditor, TextArea, TextField, Toggle } from '../components/fields';
import { Icon } from '../components/Icon';
import { toast } from '../components/overlay';
import { TagPicker } from '../components/tags';

export function RecordFormPage({ id, mountainId }: { id?: string; mountainId?: string }) {
  const store = useStore();
  const existing = id ? store.state.records.find((r) => r.id === id) : undefined;
  const [r, setR] = useState<ClimbRecord>(() => (existing ? structuredClone(existing) : createRecord({ mountainIds: mountainId ? [mountainId] : [] })));
  const [error, setError] = useState('');
  const set = (patch: Partial<ClimbRecord>) => setR((cur) => ({ ...cur, ...patch }));
  const mountains = useMemo(() => [...store.state.mountains].sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja')), [store.state.mountains]);
  const mainId = r.mountainIds[0] ?? '';
  const mainView = store.derived.viewById.get(mainId);
  const pace = computePace(r);

  if (id && !existing) {
    return (
      <>
        <PageHeader title="山行記録" back="/records" />
        <div class="page">
          <Empty icon="❓">この記録は見つかりませんでした。</Empty>
        </div>
      </>
    );
  }
  if (mountains.length === 0) {
    return (
      <>
        <PageHeader title="山行を記録" back="/records" />
        <div class="page">
          <Empty>
            先に山を登録してください。
            <br />
            <a class="btn primary small" style={{ marginTop: '10px' }} href="#/mountains/new">
              山を登録する
            </a>
          </Empty>
        </div>
      </>
    );
  }

  const copyFromCourse = () => {
    const c = mainView?.mountain.courses[0];
    if (!c) return;
    set({
      courseName: r.courseName || c.name,
      start: r.start || c.start || '',
      goal: r.goal || c.goal || '',
      distanceKm: r.distanceKm ?? c.distanceKm,
      ascentM: r.ascentM ?? c.ascentM,
      descentM: r.descentM ?? c.descentM,
      courseTimeMin: r.courseTimeMin ?? c.courseTimeMin,
    });
    toast('代表コースの値をコピーしました');
  };

  const save = async (e?: Event) => {
    e?.preventDefault();
    if (!r.mountainIds.length) return setError('登った山を選んでください');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return setError('登山日を入力してください');
    const before = store.derived.mountainById.get(r.mountainIds[0])?.status;
    const saved = await store.saveRecord({ ...r, endDate: r.endDate && r.endDate > r.date ? r.endDate : undefined });
    const after = store.derived.mountainById.get(saved.mountainIds[0])?.status;
    toast(before === 'unclimbed' && after === 'climbed' ? '記録を保存しました（登頂済みに更新）' : '記録を保存しました');
    if (existing) goBack(`/records/${saved.id}`);
    else navigate(`/records/${saved.id}`, { replace: true });
  };

  const others = r.mountainIds.slice(1);

  return (
    <>
      <PageHeader title={existing ? '山行記録を編集' : '山行を記録'} back={existing ? `/records/${existing.id}` : '/records'} />
      <form class="page form" onSubmit={save} data-testid="record-form">
        <Fold title="基本" icon="🥾" open>
          <div class="field">
            <label for="rec-mountain">
              登った山<span class="req">*</span>
            </label>
            <select
              id="rec-mountain"
              name="mountain"
              class="select"
              value={mainId}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                set({ mountainIds: v ? [v, ...others.filter((x) => x !== v)] : others });
                setError('');
              }}
            >
              <option value="">選択してください</option>
              {mountains.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                  {m.prefectures[0] ? `（${m.prefectures[0]}）` : ''}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <span class="label">一緒に登頂した山（縦走など）</span>
            <div class="chips">
              {others.map((oid) => (
                <button type="button" class="chip on" key={oid} onClick={() => set({ mountainIds: r.mountainIds.filter((x) => x !== oid) })}>
                  {store.derived.mountainById.get(oid)?.name}
                  <Icon name="x" size={14} class="x" />
                </button>
              ))}
            </div>
            <select
              class="select"
              value=""
              aria-label="一緒に登頂した山を追加"
              disabled={!mainId}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v && !r.mountainIds.includes(v)) set({ mountainIds: [...r.mountainIds, v] });
                (e.target as HTMLSelectElement).value = '';
              }}
            >
              <option value="">＋ 山を追加</option>
              {mountains
                .filter((m) => !r.mountainIds.includes(m.id))
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="rec-date">
                登山日<span class="req">*</span>
              </label>
              <input id="rec-date" name="date" class="input" type="date" value={r.date} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label for="rec-end">最終日（泊まり）</label>
              <input id="rec-end" class="input" type="date" value={r.endDate ?? ''} min={r.date} onInput={(e) => set({ endDate: (e.target as HTMLInputElement).value || undefined })} />
            </div>
          </div>
          <Toggle label="山頂に到達した" hint="撤退した場合はオフ（未踏のままになります）" checked={r.summitReached} onChange={(v) => set({ summitReached: v })} />
          <TextField label="コース名" name="courseName" value={r.courseName} onInput={(v) => set({ courseName: v })} placeholder="例: 大倉尾根ピストン" />
          <div class="grid-2">
            <TextField label="スタート地点" name="start" value={r.start} onInput={(v) => set({ start: v })} placeholder="大倉バス停" />
            <TextField label="ゴール地点" name="goal" value={r.goal} onInput={(v) => set({ goal: v })} placeholder="大倉バス停" />
          </div>
          {error && <div class="error-text">{error}</div>}
        </Fold>

        <Fold title="数値" icon="📏" open>
          {mainView?.mountain.courses[0] && (
            <button type="button" class="btn small" onClick={copyFromCourse}>
              代表コースの値をコピー
            </button>
          )}
          <div class="grid-2">
            <NumberField label="距離" unit="km" decimal name="distance" value={r.distanceKm} onChange={(v) => set({ distanceKm: v })} />
            <NumberField label="気温" unit="℃" decimal name="temperature" value={r.temperatureC} onChange={(v) => set({ temperatureC: v })} hint="山頂付近など" />
          </div>
          <div class="grid-2">
            <NumberField label="累積登り" unit="m" name="ascent" value={r.ascentM} onChange={(v) => set({ ascentM: v })} />
            <NumberField label="累積下り" unit="m" name="descent" value={r.descentM} onChange={(v) => set({ descentM: v })} />
          </div>
          <DurationField label="所要時間（休憩込み）" name="duration" value={r.durationMin} onChange={(v) => set({ durationMin: v })} />
          <DurationField label="標準コースタイム" name="coursetime" value={r.courseTimeMin} onChange={(v) => set({ courseTimeMin: v })} />
          <div class="pace-box" data-testid="pace-box">
            <span>自分のペース</span>
            <span>
              {pace !== undefined ? (
                <>
                  <span class="num">{Math.round(pace * 100)}%</span> <span class="small">{describePace(pace)}</span>
                </>
              ) : (
                <span class="small muted">所要時間とCTから自動計算</span>
              )}
            </span>
          </div>
        </Fold>

        <Fold title="コンディション" icon="🌤️" meta={[r.weather, r.trailCondition, r.crowd].filter(Boolean).join('・') || '未入力'}>
          <ChipChoice label="天候" options={WEATHER_OPTIONS} value={r.weather} onChange={(v) => set({ weather: v as string })} allowCustom />
          <ChipChoice label="路面状況" options={TRAIL_OPTIONS} value={r.trailCondition} onChange={(v) => set({ trailCondition: v as string })} allowCustom />
          <ChipChoice label="混雑" options={CROWD_OPTIONS} value={r.crowd} onChange={(v) => set({ crowd: v as string })} />
        </Fold>

        <Fold title="交通・装備・同行者" icon="🎒" meta={r.transport.join('・') || '未入力'}>
          <ChipChoice label="使用した交通手段" options={TRANSPORT_OPTIONS} value={r.transport} multiple onChange={(v) => set({ transport: v as string[] })} allowCustom />
          <TextArea label="使用装備" rows={2} value={r.gear} onInput={(v) => set({ gear: v })} placeholder="例: チェーンスパイク、ヘルメット" />
          <TextField label="同行者" value={r.companions} onInput={(v) => set({ companions: v })} placeholder="ソロ / 友人と など" />
        </Fold>

        <Fold title="評価" icon="📝" meta={Object.keys(r.ratings).length ? `${Object.keys(r.ratings).length}項目` : '未評価'} open={!existing}>
          <RatingsEditor value={r.ratings} onChange={(v) => set({ ratings: v })} />
        </Fold>

        <Fold title="感想" icon="💬" open={!existing || !!r.impressions}>
          <TextArea label="感想・メモ" name="impressions" value={r.impressions} onInput={(v) => set({ impressions: v })} rows={5} placeholder="印象に残ったこと、次回への反省など" />
        </Fold>

        <Fold title="この山行のタグ" icon="🏷️" meta={r.tagIds.length ? `${r.tagIds.length}件` : '任意'}>
          <div class="hint">この山行ならではの特徴（例: 雪景色、夕日、山小屋泊）。山の特徴タグと合わせて検索に使われます。</div>
          <TagPicker mode="select" selected={r.tagIds} onChange={(s) => set({ tagIds: s })} />
        </Fold>

        <Fold title="写真" icon="📷" meta="今後対応">
          <div class="hint">写真の保存は今後のバージョンで対応予定です（データ構造は対応済み）。</div>
        </Fold>

        <div class="save-bar">
          <button type="button" class="btn" onClick={() => goBack(existing ? `/records/${existing.id}` : '/records')}>
            キャンセル
          </button>
          <button type="submit" class="btn primary" data-testid="save-record">
            <Icon name="check" size={18} />
            保存
          </button>
        </div>
        {r.durationMin !== undefined && r.courseTimeMin === undefined && mainView?.courseTimeMin.value !== undefined && (
          <div class="hint">参考: 代表コースのCTは {formatDuration(mainView.courseTimeMin.value)} です。</div>
        )}
      </form>
    </>
  );
}
