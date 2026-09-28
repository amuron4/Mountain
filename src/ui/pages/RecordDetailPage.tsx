import { Fragment } from 'preact';
import { formatDate, formatDuration, formatKm, formatMeters } from '../../domain/format';
import { computePace, describePace } from '../../domain/record';
import { useStore } from '../../state/hooks';
import { goBack } from '../../state/router';
import { Card, Empty, Metric, PageHeader } from '../components/common';
import { RatingBars } from '../components/fields';
import { Icon } from '../components/Icon';
import { confirmDialog, toast } from '../components/overlay';
import { TagGroups } from '../components/tags';

export function RecordDetailPage({ id }: { id: string }) {
  const store = useStore();
  const r = store.state.records.find((x) => x.id === id);
  const { mountainById, tagIndex } = store.derived;
  if (!r) {
    return (
      <>
        <PageHeader title="山行記録" back="/records" />
        <div class="page">
          <Empty icon="❓">この記録は見つかりませんでした。</Empty>
        </div>
      </>
    );
  }
  const names = r.mountainIds.map((mid) => mountainById.get(mid)?.name ?? '（削除された山）');
  const pace = computePace(r);

  const onDelete = async () => {
    const ok = await confirmDialog({ title: 'この山行記録を削除しますか？', message: `${formatDate(r.date)} ${names.join('・')}`, okLabel: '削除する', danger: true });
    if (!ok) return;
    await store.deleteRecord(r.id);
    toast('記録を削除しました');
    goBack('/records');
  };

  const cond: [string, string][] = (
    [
      ['天候', r.weather],
      ['気温', r.temperatureC !== undefined ? `${r.temperatureC}℃` : ''],
      ['路面', r.trailCondition],
      ['混雑', r.crowd],
      ['交通', r.transport.join('・')],
      ['装備', r.gear],
      ['同行者', r.companions],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <>
      <PageHeader title={names[0]} sub={formatDate(r.date)} back="/records">
        <a class="icon-btn" href={`#/records/${r.id}/edit`} aria-label="編集">
          <Icon name="edit" />
        </a>
      </PageHeader>
      <div class="page">
        <section class="card hero">
          <div class="kana">
            {formatDate(r.date)}
            {r.endDate ? ` 〜 ${formatDate(r.endDate)}` : ''}
          </div>
          <h2>
            {r.mountainIds.map((mid, i) => (
              <span key={mid}>
                {i > 0 && '・'}
                <a href={`#/mountains/${mid}`} style={{ color: 'inherit' }}>
                  {mountainById.get(mid)?.name ?? '（削除された山）'}
                </a>
              </span>
            ))}
          </h2>
          <div class="place">
            {r.courseName || 'コース未入力'}
            {(r.start || r.goal) && (
              <div class="small muted">
                {r.start || '?'} → {r.goal || '?'}
              </div>
            )}
          </div>
          {!r.summitReached && <div class="warn-box">この山行は山頂に到達していません（撤退）</div>}
        </section>

        <Card title="数値" icon="📏">
          <div class="metrics large">
            <Metric k="距離" icon="route" v={formatKm(r.distanceKm)} />
            <Metric k="累積登り" icon="up" v={formatMeters(r.ascentM)} />
            <Metric k="累積下り" v={formatMeters(r.descentM)} />
            <Metric k="所要時間" icon="clock" v={formatDuration(r.durationMin)} />
            <Metric k="標準CT" v={formatDuration(r.courseTimeMin)} />
            <Metric k="ペース" v={pace !== undefined ? `${Math.round(pace * 100)}%` : '—'} src={pace !== undefined ? describePace(pace) : undefined} />
          </div>
        </Card>

        {cond.length > 0 && (
          <Card title="コンディション・交通" icon="🌤️">
            <dl class="kv">
              {cond.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </Fragment>
              ))}
            </dl>
          </Card>
        )}

        <Card title="評価" icon="📝">
          <RatingBars ratings={r.ratings} compact />
        </Card>

        {r.impressions && (
          <Card title="感想" icon="💬">
            <div class="prose">{r.impressions}</div>
          </Card>
        )}

        {r.tagIds.length > 0 && (
          <Card title="この山行のタグ" icon="🏷️">
            <TagGroups tagIds={r.tagIds} index={tagIndex} />
          </Card>
        )}

        <button class="btn danger block" onClick={onDelete} data-testid="delete-record">
          <Icon name="trash" size={18} />
          この記録を削除
        </button>
      </div>
    </>
  );
}
