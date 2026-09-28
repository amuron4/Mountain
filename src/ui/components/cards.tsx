import { formatDate, formatDuration, formatDurationShort, formatKm, formatMeters } from '../../domain/format';
import type { MountainView } from '../../domain/mountain';
import type { TagIndex } from '../../domain/tags';
import type { ClimbRecord, Mountain } from '../../domain/types';
import { Metric, StatusBadge, Wish } from './common';
import { Icon } from './Icon';
import { TagLine } from './tags';

interface MountainCardProps {
  view: MountainView;
  index: TagIndex;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onToggleFavorite?: () => void;
}

export function MountainCard({ view, index, selectable, selected, onSelect, onToggleFavorite }: MountainCardProps) {
  const m = view.mountain;
  const place = [m.prefectures.join('・'), m.range].filter(Boolean).join(' / ');
  const inner = (
    <>
      <div class="m-head">
        {selectable && (
          <span class="select-check" aria-hidden="true">
            <Icon name="check" size={16} strokeWidth={3} />
          </span>
        )}
        <div class="m-name">
          <h3>
            {m.name}
            {m.elevationM !== undefined && <span class="elev">{formatMeters(m.elevationM)}</span>}
          </h3>
          <div class="m-sub">
            {m.kana && `${m.kana}　`}
            {place}
          </div>
        </div>
        {onToggleFavorite && !selectable && (
          <button
            type="button"
            class={`icon-btn star-btn ${m.favorite ? 'on' : ''}`}
            aria-label={m.favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
            aria-pressed={m.favorite}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={{ margin: '-8px -6px 0 0' }}
          >
            <Icon name="star" filled={m.favorite} size={22} />
          </button>
        )}
      </div>
      <div class="metrics">
        <Metric k="距離" icon="route" v={formatKm(view.distanceKm.value)} />
        <Metric k="累積↑" icon="up" v={formatMeters(view.ascentM.value)} />
        <Metric k="CT" icon="clock" v={formatDurationShort(view.courseTimeMin.value)} />
        <Metric k={view.climbCount ? '登頂' : 'アクセス'} icon={view.climbCount ? 'flag' : 'train'} v={view.climbCount ? `${view.climbCount}回` : formatDurationShort(m.accessMinutes)} />
      </div>
      <div class="m-foot">
        <StatusBadge status={m.status} />
        <Wish n={m.wish} />
        <TagLine tagIds={view.tagIds} index={index} max={4} />
      </div>
      {view.lastClimbed && <div class="m-sub" style={{ marginTop: '6px' }}>最終: {formatDate(view.lastClimbed)}</div>}
    </>
  );
  if (selectable) {
    return (
      <button
        type="button"
        class={`m-card ${selected ? 'selected' : ''}`}
        style={{ textAlign: 'left', width: '100%', font: 'inherit' }}
        aria-pressed={selected}
        onClick={onSelect}
        data-testid="mountain-card"
      >
        {inner}
      </button>
    );
  }
  return (
    <a class="m-card" href={`#/mountains/${m.id}`} data-testid="mountain-card">
      {inner}
    </a>
  );
}

export function MiniMountainCard({ view }: { view: MountainView }) {
  const m = view.mountain;
  return (
    <a class="mini-card" href={`#/mountains/${m.id}`}>
      <h4>{m.name}</h4>
      <div class="mc-sub">
        {formatMeters(m.elevationM)} ・ {m.range || m.prefectures[0] || '—'}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <StatusBadge status={m.status} />
        <Wish n={m.wish} />
      </div>
      <div class="mc-nums">
        {formatKm(view.distanceKm.value)} ・ ↑{formatMeters(view.ascentM.value)}
      </div>
    </a>
  );
}

export function RecordItem({ record, mountains }: { record: ClimbRecord; mountains: Map<string, Mountain> }) {
  const [y, mo, d] = record.date.split('-');
  const names = record.mountainIds.map((id) => mountains.get(id)?.name ?? '（削除された山）');
  return (
    <a class="r-item" href={`#/records/${record.id}`} data-testid="record-item">
      <div class="r-date">
        <div class="y">{y}</div>
        <div class="md">
          {Number(mo)}/{Number(d)}
        </div>
      </div>
      <div class="r-body">
        <h3>
          {names.join('・')}
          {!record.summitReached && <span class="tag danger" style={{ marginLeft: '6px' }}>撤退</span>}
        </h3>
        <div class="course">{record.courseName || [record.start, record.goal].filter(Boolean).join(' → ') || '—'}</div>
        <div class="r-nums">
          {record.distanceKm !== undefined && (
            <span>
              <Icon name="route" size={13} />
              {formatKm(record.distanceKm)}
            </span>
          )}
          {record.ascentM !== undefined && (
            <span>
              <Icon name="up" size={13} />
              {formatMeters(record.ascentM)}
            </span>
          )}
          {record.durationMin !== undefined && (
            <span>
              <Icon name="clock" size={13} />
              {formatDuration(record.durationMin)}
            </span>
          )}
          {record.weather && <span>{record.weather}</span>}
        </div>
      </div>
    </a>
  );
}
