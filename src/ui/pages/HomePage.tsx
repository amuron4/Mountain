import { daysBetween, formatDate, formatMeters, formatNumber } from '../../domain/format';
import { sortRecordsDesc } from '../../domain/record';
import { computeSummary, elevationDistribution, favorites, nextWishList, recordsByYear, unclimbedCandidates } from '../../domain/stats';
import { MOOD_RULES } from '../../domain/suggest';
import { useStore } from '../../state/hooks';
import { navigate } from '../../state/router';
import { MiniMountainCard, RecordItem } from '../components/cards';
import { Card, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { toast } from '../components/overlay';

const HOME_MOODS = ['hard', 'gentle', 'view', 'ridge', 'waterfall', 'onsen', 'quiet', 'public'];

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div class="bars">
      {rows.map((r) => (
        <div class="bar-row" key={r.label}>
          <span class="b-label">{r.label}</span>
          <span class="b-track">
            <span class="b-fill" style={{ width: `${(r.value / max) * 100}%`, display: 'block' }} />
          </span>
          <span class="b-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function HomePage() {
  const store = useStore();
  const { views, mountainById } = store.derived;
  const { records, settings } = store.state;
  const summary = computeSummary(views, records);
  const recent = sortRecordsDesc(records).slice(0, 3);
  const wish = nextWishList(views, 8);
  const candidates = unclimbedCandidates(views, 5);
  const favs = favorites(views, 8);
  const years = recordsByYear(records).slice(-6);
  const elevDist = elevationDistribution(views);
  const isEmpty = views.length === 0;
  const needsBackup = !isEmpty && (!settings.lastExportAt || daysBetween(settings.lastExportAt) > 30);

  return (
    <>
      <PageHeader title="山ノート">
        <a class="icon-btn" href="#/mountains/new" aria-label="山を追加">
          <Icon name="plus" />
        </a>
      </PageHeader>
      <div class="page">
        {isEmpty && (
          <section class="card welcome" data-testid="welcome">
            <div class="logo" aria-hidden="true">
              🏔️
            </div>
            <h2>自分だけの登山データベース</h2>
            <p>
              登った山・行きたい山を記録して、
              <br />
              経験をもとに次の山を選ぼう。
            </p>
            <div class="btn-row" style={{ flexDirection: 'column' }}>
              <a class="btn primary" href="#/mountains/new">
                <Icon name="plus" size={18} />
                最初の山を登録する
              </a>
              <button
                class="btn"
                onClick={async () => {
                  await store.loadSample();
                  toast('サンプルデータを読み込みました');
                }}
              >
                サンプルデータで試す
              </button>
            </div>
            <p class="hint" style={{ marginTop: '12px', marginBottom: 0 }}>
              データはこの端末内に保存されます。設定からいつでもバックアップできます。
            </p>
          </section>
        )}

        {needsBackup && (
          <a class="warn-box" href="#/settings" style={{ textDecoration: 'none', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Icon name="download" size={18} />
            <span>
              {settings.lastExportAt ? `最後のバックアップから${daysBetween(settings.lastExportAt)}日経過。` : 'まだバックアップしていません。'}
              JSONで書き出しておきましょう →
            </span>
          </a>
        )}

        {!isEmpty && (
          <div class="stat-grid" data-testid="stats">
            <div class="stat">
              <div class="label">登頂数</div>
              <div class="value">
                {summary.climbedMountains}
                <span class="unit">座</span>
              </div>
              <div class="foot">登録 {summary.totalMountains}座中</div>
            </div>
            <div class="stat">
              <div class="label">山行数</div>
              <div class="value">
                {summary.recordCount}
                <span class="unit">回</span>
              </div>
              <div class="foot">今年 {summary.thisYear.records}回</div>
            </div>
            <div class="stat">
              <div class="label">総距離</div>
              <div class="value">
                {formatNumber(summary.totalDistanceKm, 1)}
                <span class="unit">km</span>
              </div>
              <div class="foot">今年 {formatNumber(summary.thisYear.distanceKm, 1)}km</div>
            </div>
            <div class="stat">
              <div class="label">総累積標高</div>
              <div class="value">
                {formatNumber(summary.totalAscentM)}
                <span class="unit">m</span>
              </div>
              <div class="foot">今年 {formatNumber(summary.thisYear.ascentM)}m</div>
            </div>
          </div>
        )}

        {!isEmpty && (
          <Card title="今日どこ行く？" icon="🧭" more={{ href: '#/today', label: '条件を選ぶ' }} testId="home-today">
            <div class="chips">
              {MOOD_RULES.filter((m) => HOME_MOODS.includes(m.id)).map((m) => (
                <button class="chip" key={m.id} onClick={() => navigate(`/today?moods=${m.id}`)}>
                  <span aria-hidden="true">{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </Card>
        )}

        {!isEmpty && (
          <Card title="次に行きたい山" icon="⭐" more={{ href: '#/mountains', label: '一覧' }} testId="home-wish">
            {wish.length ? (
              <div class="h-scroll">
                {wish.map((v) => (
                  <MiniMountainCard view={v} key={v.mountain.id} />
                ))}
              </div>
            ) : (
              <div class="hint">山の「行きたい度」を設定すると、ここに表示されます。</div>
            )}
          </Card>
        )}

        {!isEmpty && (
          <Card title="最近の山行" icon="🥾" more={{ href: '#/records', label: 'すべて' }} testId="home-recent">
            {recent.length ? (
              <div class="list">
                {recent.map((r) => (
                  <RecordItem record={r} mountains={mountainById} key={r.id} />
                ))}
              </div>
            ) : (
              <div class="hint">
                まだ山行記録がありません。<a href="#/records/new">記録を追加</a>
              </div>
            )}
          </Card>
        )}

        {candidates.length > 0 && (
          <Card title="未踏候補" icon="🗺️" more={{ href: '#/mountains', label: '探す' }} testId="home-unclimbed">
            {candidates.map((v) => (
              <a class="row-link" href={`#/mountains/${v.mountain.id}`} key={v.mountain.id}>
                <div class="rl-main">
                  <div class="rl-title">
                    {v.mountain.name} {v.mountain.wish > 0 && <span class="wish">{'★'.repeat(v.mountain.wish)}</span>}
                  </div>
                  <div class="rl-sub">{[v.mountain.range, v.mountain.prefectures.join('・')].filter(Boolean).join(' / ')}</div>
                </div>
                <div class="rl-right">{formatMeters(v.elevationM)}</div>
                <Icon name="right" size={18} class="muted" />
              </a>
            ))}
          </Card>
        )}

        {favs.length > 0 && (
          <Card title="お気に入り" icon="💚" testId="home-favorites">
            <div class="h-scroll">
              {favs.map((v) => (
                <MiniMountainCard view={v} key={v.mountain.id} />
              ))}
            </div>
          </Card>
        )}

        {records.length > 0 && (
          <Card title="統計" icon="📊" testId="home-stats">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <dl class="kv">
                {summary.highestClimbed && (
                  <>
                    <dt>最高到達</dt>
                    <dd>
                      {summary.highestClimbed.name}（{formatMeters(summary.highestClimbed.elevationM)}）
                    </dd>
                  </>
                )}
                {summary.pace !== undefined && (
                  <>
                    <dt>自分のペース</dt>
                    <dd>
                      コースタイムの <b class="num">{Math.round(summary.pace * 100)}%</b>
                      <span class="hint">（中央値）</span>
                    </dd>
                  </>
                )}
                <dt>最初の記録</dt>
                <dd>{formatDate(sortRecordsDesc(records).at(-1)?.date)}</dd>
              </dl>
              <div>
                <div class="section-title" style={{ margin: '0 0 6px' }}>
                  年別の山行数
                </div>
                <Bars rows={years.map((y) => ({ label: `${y.year}年`, value: y.count }))} />
              </div>
              <div>
                <div class="section-title" style={{ margin: '0 0 6px' }}>
                  登頂した山の標高帯
                </div>
                <Bars rows={elevDist.map((e) => ({ label: e.label, value: e.count }))} />
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
