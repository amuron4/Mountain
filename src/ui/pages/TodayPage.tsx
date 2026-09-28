import { useEffect, useState } from 'preact/hooks';
import { formatDuration, formatDurationShort, formatKm, formatMeters } from '../../domain/format';
import { getSuggester, MOOD_RULES, SEASON_LABEL, seasonOf, type Suggestion } from '../../domain/suggest';
import { useStore } from '../../state/hooks';
import { navigate } from '../../state/router';
import { MAX_COMPARE, toggleCompare, useUi } from '../../state/ui';
import { Empty, Metric, PageHeader, StatusBadge } from '../components/common';
import { Toggle } from '../components/fields';
import { Icon } from '../components/Icon';
import { toast } from '../components/overlay';

export function TodayPage({ initialMoods }: { initialMoods: string[] }) {
  const store = useStore();
  const ui = useUi();
  const [moods, setMoods] = useState<string[]>(initialMoods.filter((id) => MOOD_RULES.some((m) => m.id === id)));
  const [includeRevisit, setIncludeRevisit] = useState(true);
  const [includeClimbed, setIncludeClimbed] = useState(false);
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const { views, tagIndex, pace } = store.derived;
  const nearby = store.state.settings.nearbyMinutes;
  const now = new Date();

  useEffect(() => {
    let alive = true;
    getSuggester()
      .suggest({ moodIds: moods, includeRevisit, includeClimbed, date: new Date(), nearbyMinutes: nearby, limit: 10 }, { views, tagIndex, pace })
      .then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [moods, includeRevisit, includeClimbed, views, tagIndex, pace, nearby]);

  const toggle = (id: string) => setMoods((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const candidateCount = views.filter((v) => v.mountain.status === 'unclimbed' || (includeRevisit && v.mountain.status === 'revisit') || includeClimbed).length;

  return (
    <>
      <PageHeader title="今日どこ行く？" sub={`${SEASON_LABEL[seasonOf(now)]}・候補${candidateCount}座`} />
      <div class="page">
        <section class="card" data-testid="mood-picker">
          <h2 class="card-title">今日の気分は？</h2>
          <div class="mood-grid">
            {MOOD_RULES.map((m) => (
              <button type="button" key={m.id} class={`mood ${moods.includes(m.id) ? 'on' : ''}`} aria-pressed={moods.includes(m.id)} onClick={() => toggle(m.id)}>
                <span class="emoji" aria-hidden="true">
                  {m.emoji}
                </span>
                {m.label}
                {m.hard && <span class="req" title="必須条件（合わない山は除外）">必須</span>}
              </button>
            ))}
          </div>
          <div class="hint" style={{ marginTop: '10px' }}>
            「必須」は合わない山を除外します。その他は合うほど上位に。「近場」は片道{formatDuration(nearby)}以内（設定で変更可）。
          </div>
          <div class="divider" style={{ margin: '10px 0 2px' }} />
          <Toggle label="「再訪したい」山も含める" checked={includeRevisit} onChange={setIncludeRevisit} />
          <Toggle label="登頂済みの山も含める" checked={includeClimbed} onChange={setIncludeClimbed} />
          {moods.length > 0 && (
            <button class="btn small ghost" onClick={() => setMoods([])}>
              気分をリセット
            </button>
          )}
        </section>

        <div class="section-title">{moods.length ? '条件に合う候補' : 'おすすめ（行きたい度・季節から）'}</div>

        {results && results.length === 0 && (
          <Empty icon="🤔">
            条件に合う候補が見つかりませんでした。
            <br />
            気分を減らすか、山にタグ・コース情報・アクセス時間を登録すると見つかりやすくなります。
          </Empty>
        )}

        <div class="list" data-testid="suggestions">
          {results?.map((s, i) => {
            const v = s.view;
            const m = v.mountain;
            const matched = s.matchedMoodIds.length;
            const inCompare = ui.compareIds.includes(m.id);
            return (
              <article class="sg-card" key={m.id} data-testid="suggestion">
                <div class="sg-head">
                  <span class="sg-rank">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={`#/mountains/${m.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <h3 style={{ fontSize: '17px', fontWeight: 750 }}>
                        {m.name} <span class="num small muted">{formatMeters(m.elevationM)}</span>
                      </h3>
                    </a>
                    <div class="small muted">{[m.range, m.prefectures.join('・')].filter(Boolean).join(' / ')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    <StatusBadge status={m.status} />
                    {moods.length > 0 && (
                      <span class={`match-badge ${matched < moods.length ? 'partial' : ''}`}>
                        {matched === moods.length ? 'すべて一致' : `${matched}/${moods.length} 一致`}
                        {s.partialMoodIds.length > 0 && '・一部'}
                      </span>
                    )}
                  </div>
                </div>
                <div class="metrics">
                  <Metric k="距離" v={formatKm(v.distanceKm.value)} />
                  <Metric k="累積↑" v={formatMeters(v.ascentM.value)} />
                  <Metric k="CT" v={formatDurationShort(v.courseTimeMin.value)} />
                  <Metric k="アクセス" v={formatDurationShort(m.accessMinutes)} />
                </div>
                <div>
                  <div class="small" style={{ fontWeight: 700, marginBottom: '4px' }}>
                    選んだ理由
                  </div>
                  <ul class="sg-reasons">
                    {s.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
                {s.warnings.length > 0 && <div class="sg-warn">⚠️ {s.warnings.join(' ／ ')}</div>}
                <div class="btn-row">
                  <button
                    class={`btn small ${inCompare ? 'primary' : ''}`}
                    onClick={() => {
                      if (!toggleCompare(m.id)) toast(`比較は最大${MAX_COMPARE}座までです`);
                    }}
                  >
                    <Icon name="compare" size={16} />
                    {inCompare ? '比較に追加済み' : '比較に追加'}
                  </button>
                  <a class="btn small" href={`#/mountains/${m.id}`}>
                    詳細を見る
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {ui.compareIds.length >= 2 && (
        <div class="floating-bar">
          <span class="fb-text">{ui.compareIds.length}座を比較できます</span>
          <button class="btn primary small" onClick={() => navigate('/compare')}>
            比較する
          </button>
        </div>
      )}
    </>
  );
}
