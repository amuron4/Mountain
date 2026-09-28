import { useMemo } from 'preact/hooks';
import { benchmarkAgainst } from '../../domain/benchmark';
import { elevationSourceLabel } from '../../domain/master/elevationSource';
import { formatDuration, formatDurationShort, formatKm, formatMeters } from '../../domain/format';
import { estimateMyTime, STATUS_LABEL, type StatSource } from '../../domain/mountain';
import type { MountainStatus } from '../../domain/types';
import { useStore } from '../../state/hooks';
import { goBack, navigate } from '../../state/router';
import { MAX_COMPARE, toggleCompare, useUi } from '../../state/ui';
import { RecordItem } from '../components/cards';
import { Card, Empty, Metric, PageHeader, Segmented, Wish } from '../components/common';
import { RatingBars } from '../components/fields';
import { Icon } from '../components/Icon';
import { confirmDialog, toast } from '../components/overlay';
import { TagGroups } from '../components/tags';

const SRC_LABEL: Record<StatSource, string | undefined> = { course: '代表コース', record: '山行記録', none: undefined };

export function MountainDetailPage({ id }: { id: string }) {
  const store = useStore();
  const ui = useUi();
  const { viewById, views, tagIndex, mountainById, pace } = store.derived;
  const view = viewById.get(id);
  const climbed = useMemo(() => views.filter((v) => v.isClimbed), [views]);
  const bench = useMemo(() => (view ? benchmarkAgainst(view, climbed) : []), [view, climbed]);

  if (!view) {
    return (
      <>
        <PageHeader title="山" back="/mountains" />
        <div class="page">
          <Empty icon="❓">この山は見つかりませんでした（削除された可能性があります）。</Empty>
        </div>
      </>
    );
  }
  const m = view.mountain;
  const myTime = estimateMyTime(view.courseTimeMin.value, pace);
  const inCompare = ui.compareIds.includes(m.id);

  const onDelete = async () => {
    const only = view.records.filter((r) => r.mountainIds.length === 1).length;
    const ok = await confirmDialog({
      title: `「${m.name}」を削除しますか？`,
      message: only ? `この山だけの山行記録 ${only}件 も削除されます。\nこの操作は元に戻せません（設定の端末内バックアップから復元は可能）。` : 'この操作は元に戻せません。',
      okLabel: '削除する',
      danger: true,
    });
    if (!ok) return;
    await store.deleteMountain(m.id);
    toast(`「${m.name}」を削除しました`);
    goBack('/mountains');
  };

  return (
    <>
      <PageHeader title={m.name} back="/mountains">
        <button class={`icon-btn star-btn ${m.favorite ? 'on' : ''}`} aria-label={m.favorite ? 'お気に入りから外す' : 'お気に入りに追加'} aria-pressed={m.favorite} onClick={() => store.patchMountain(m.id, { favorite: !m.favorite })}>
          <Icon name="star" filled={m.favorite} />
        </button>
        <a class="icon-btn" href={`#/mountains/${m.id}/edit`} aria-label="編集">
          <Icon name="edit" />
        </a>
      </PageHeader>
      <div class="page">
        <section class="card hero" data-testid="mountain-hero">
          <div class="h-top">
            <div style={{ flex: 1, minWidth: 0 }}>
              {m.kana && <div class="kana">{m.kana}</div>}
              <h2>{m.name}</h2>
              <div class="place">{[m.region, m.prefectures.join('・'), m.range].filter(Boolean).join(' / ') || '地域未設定'}</div>
              {m.location && (
                <div class="place small" data-testid="mountain-location">
                  📍 <span class="num">{m.location.lat.toFixed(4)}, {m.location.lng.toFixed(4)}</span>
                  {' ・ '}
                  <a href={`https://maps.gsi.go.jp/#15/${m.location.lat}/${m.location.lng}/`} target="_blank" rel="noopener noreferrer">
                    地理院地図
                  </a>
                  {m.masterId && <span class="muted">（山名データより）</span>}
                </div>
              )}
            </div>
            <div class="elev-big num" title={elevationSourceLabel(m.ext?.elevationSource as string | undefined)?.description}>
              {m.elevationM !== undefined ? Math.round(m.elevationM).toLocaleString() : '—'}
              <small>m</small>
              {m.elevationM !== undefined && elevationSourceLabel(m.ext?.elevationSource as string | undefined)?.short && (
                <span class="mh-elev-src" data-testid="elevation-source-tag">
                  {elevationSourceLabel(m.ext?.elevationSource as string | undefined)!.short}
                </span>
              )}
            </div>
          </div>
          <Segmented<MountainStatus>
            label="登頂状況"
            value={m.status}
            onChange={(s) => store.patchMountain(m.id, { status: s })}
            options={(['unclimbed', 'climbed', 'revisit'] as MountainStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
            {m.wish > 0 && (
              <span>
                行きたい度 <Wish n={m.wish} />
              </span>
            )}
            {view.climbCount > 0 && (
              <span class="muted">
                登った回数 <b>{view.climbCount}</b>回
              </span>
            )}
          </div>
        </section>

        <Card title="コースの数値" icon="📏" testId="mountain-metrics">
          <div class="metrics large">
            <Metric k="距離" icon="route" v={formatKm(view.distanceKm.value)} src={SRC_LABEL[view.distanceKm.source]} />
            <Metric k="累積登り" icon="up" v={formatMeters(view.ascentM.value)} src={SRC_LABEL[view.ascentM.source]} />
            <Metric k="累積下り" v={formatMeters(view.descentM.value)} src={SRC_LABEL[view.descentM.source]} />
            <Metric k="コースタイム" icon="clock" v={formatDuration(view.courseTimeMin.value)} src={SRC_LABEL[view.courseTimeMin.source]} />
            <Metric k="自分の予想" v={formatDuration(myTime)} src={pace ? `ペース${Math.round(pace * 100)}%` : '記録が増えると表示'} />
            <Metric k="アクセス" icon="train" v={formatDuration(m.accessMinutes)} src="片道" />
          </div>
          {m.accessNote && <div class="hint" style={{ marginTop: '8px' }}>🚃 {m.accessNote}</div>}
        </Card>

        <Card title="自分の経験と比べると" icon="🧭" testId="benchmark">
          {bench.length ? (
            <div class="bench">
              {bench.map((b) => (
                <div class="bench-line" key={b.metric}>
                  <div class="bl-k">
                    {b.label}
                    <span class="bl-v">{b.valueText}</span>
                  </div>
                  <ul>
                    {b.isNewRecord && <li class="newrec">🏆 登った山の中で最大（自己最高を更新）</li>}
                    {b.sentences.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div class="hint">登頂済みの山が増えると、「〇〇より距離が短い」のように自分の経験を基準に比較できます。</div>
          )}
        </Card>

        <Card title="評価" icon="📝" testId="mountain-ratings">
          <RatingBars ratings={view.ratings} />
          <div class="hint" style={{ marginTop: '8px' }}>
            {m.status === 'unclimbed' ? '未踏の山の評価は「予想」です。' : '山の評価が未設定の項目は山行記録の平均を表示しています。'}
          </div>
        </Card>

        <Card title="特徴" icon="🏷️" testId="mountain-tags">
          <TagGroups tagIds={view.tagIds} index={tagIndex} empty="特徴タグはまだありません。編集から追加できます。" />
        </Card>

        {m.courses.length > 0 && (
          <Card title="コース" icon="🗺️">
            <div class="list">
              {m.courses.map((c, i) => (
                <div class="course-card" key={c.id}>
                  <div class="cc-head">
                    <span class="grow">{c.name || `コース${i + 1}`}</span>
                    {i === 0 && <span class="tag good">代表</span>}
                  </div>
                  {(c.start || c.goal) && (
                    <div class="small muted">
                      {c.start || '?'} → {c.goal || '?'}
                    </div>
                  )}
                  <div class="metrics">
                    <Metric k="距離" v={formatKm(c.distanceKm)} />
                    <Metric k="累積↑" v={formatMeters(c.ascentM)} />
                    <Metric k="累積↓" v={formatMeters(c.descentM)} />
                    <Metric k="CT" v={formatDurationShort(c.courseTimeMin)} />
                  </div>
                  {c.note && <div class="small muted">{c.note}</div>}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card title={`山行記録（${view.records.length}）`} icon="🥾" testId="mountain-records">
          <div class="list">
            {view.records.map((r) => (
              <RecordItem record={r} mountains={mountainById} key={r.id} />
            ))}
            {view.records.length === 0 && <div class="hint">まだ山行記録がありません。</div>}
            <a class="btn primary" href={`#/records/new?mountain=${m.id}`}>
              <Icon name="plus" size={18} />
              この山の山行を記録
            </a>
          </div>
        </Card>

        {(m.memo || m.links.length > 0) && (
          <Card title="メモ" icon="🗒️">
            {m.memo && <div class="prose">{m.memo}</div>}
            {m.links.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                {m.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label || l.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div class="btn-row">
          <button
            class={`btn ${inCompare ? 'primary' : ''}`}
            onClick={() => {
              if (!toggleCompare(m.id)) toast(`比較は最大${MAX_COMPARE}座までです`);
              else toast(inCompare ? '比較から外しました' : `比較に追加しました（${ui.compareIds.length + (inCompare ? -1 : 1)}座）`);
            }}
          >
            <Icon name="compare" size={18} />
            {inCompare ? '比較に追加済み' : '比較に追加'}
          </button>
          {ui.compareIds.length >= 2 && (
            <button class="btn" onClick={() => navigate('/compare')}>
              比較を見る
            </button>
          )}
        </div>
        <button class="btn danger block" onClick={onDelete} data-testid="delete-mountain">
          <Icon name="trash" size={18} />
          この山を削除
        </button>
      </div>
    </>
  );
}
