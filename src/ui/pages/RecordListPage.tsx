import { useMemo, useState } from 'preact/hooks';
import { formatNumber } from '../../domain/format';
import { sortRecordsDesc } from '../../domain/record';
import { normalizeText } from '../../domain/util';
import { useStore } from '../../state/hooks';
import { RecordItem } from '../components/cards';
import { Empty, PageHeader } from '../components/common';
import { Icon } from '../components/Icon';

export function RecordListPage() {
  const store = useStore();
  const { mountainById } = store.derived;
  const [q, setQ] = useState('');
  const records = useMemo(() => {
    const all = sortRecordsDesc(store.state.records);
    const nq = normalizeText(q);
    if (!nq) return all;
    return all.filter((r) =>
      normalizeText(
        [r.courseName, r.start, r.goal, r.impressions, r.weather, r.companions, r.date, ...r.mountainIds.map((id) => {
          const m = mountainById.get(id);
          return m ? `${m.name} ${m.kana}` : '';
        })].join(' '),
      ).includes(nq),
    );
  }, [store.state.records, mountainById, q]);

  const byYear = new Map<string, typeof records>();
  for (const r of records) {
    const y = r.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }

  return (
    <>
      <PageHeader title="山行記録" sub={`${store.state.records.length}件`}>
        <a class="icon-btn" href="#/records/new" aria-label="山行を記録">
          <Icon name="plus" />
        </a>
      </PageHeader>
      <div class="page">
        {store.state.records.length > 0 && (
          <label class="search-box">
            <Icon name="search" size={19} />
            <input type="search" value={q} placeholder="山名・コース・感想で検索" aria-label="記録を検索" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </label>
        )}
        {[...byYear.entries()].map(([year, list]) => (
          <section key={year} class="list">
            <div class="year-head">
              <h2>{year}</h2>
              <span class="yh-meta">
                {list.length}回 ・ {formatNumber(list.reduce((a, r) => a + (r.distanceKm ?? 0), 0), 1)}km ・ ↑{formatNumber(list.reduce((a, r) => a + (r.ascentM ?? 0), 0))}m
              </span>
            </div>
            {list.map((r) => (
              <RecordItem record={r} mountains={mountainById} key={r.id} />
            ))}
          </section>
        ))}
        {store.state.records.length === 0 && (
          <Empty icon="🥾">
            まだ山行記録がありません。
            <br />
            <a class="btn primary small" style={{ marginTop: '10px' }} href="#/records/new">
              山行を記録する
            </a>
          </Empty>
        )}
        {store.state.records.length > 0 && records.length === 0 && <Empty icon="🔍">該当する記録がありません。</Empty>}
      </div>
      <a class="fab" href="#/records/new" aria-label="山行を記録">
        <Icon name="plus" size={28} />
      </a>
    </>
  );
}
