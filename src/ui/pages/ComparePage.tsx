import { useMemo, useState } from 'preact/hooks';
import { benchmarkAgainst, benchmarkHeadline } from '../../domain/benchmark';
import { buildCompareRows } from '../../domain/compare';
import { formatMeters } from '../../domain/format';
import { normalizeText } from '../../domain/util';
import { useStore } from '../../state/hooks';
import { MAX_COMPARE, setUi, toggleCompare, useUi } from '../../state/ui';
import { Card, Empty, PageHeader, StatusBadge } from '../components/common';
import { Icon } from '../components/Icon';
import { Sheet, toast } from '../components/overlay';

function PickerSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const ui = useUi();
  const [q, setQ] = useState('');
  const list = store.derived.views
    .filter((v) => !q || normalizeText(`${v.mountain.name}${v.mountain.kana}${v.mountain.range}`).includes(normalizeText(q)))
    .sort((a, b) => (a.mountain.kana || a.mountain.name).localeCompare(b.mountain.kana || b.mountain.name, 'ja'));
  return (
    <Sheet title={`比較する山を選ぶ（${ui.compareIds.length}/${MAX_COMPARE}）`} onClose={onClose} full testId="compare-picker" footer={<button class="btn primary" onClick={onClose}>完了</button>}>
      <label class="search-box">
        <Icon name="search" size={18} />
        <input value={q} placeholder="山名で検索" aria-label="山名で検索" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      <div class="option-list">
        {list.map((v) => {
          const on = ui.compareIds.includes(v.mountain.id);
          return (
            <button
              type="button"
              key={v.mountain.id}
              class={on ? 'sel' : ''}
              aria-pressed={on}
              onClick={() => {
                if (!toggleCompare(v.mountain.id)) toast(`比較は最大${MAX_COMPARE}座までです`);
              }}
            >
              <span class="grow">
                {v.mountain.name} <span class="small muted">{formatMeters(v.elevationM)}</span>
              </span>
              <StatusBadge status={v.mountain.status} />
              {on && <Icon name="check" size={18} />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export function ComparePage() {
  const store = useStore();
  const ui = useUi();
  const [picking, setPicking] = useState(false);
  const { viewById, views, tagIndex, pace } = store.derived;
  const selected = ui.compareIds.map((id) => viewById.get(id)).filter((v) => !!v);
  const rows = useMemo(() => buildCompareRows(selected, tagIndex, pace), [selected, tagIndex, pace]);
  const climbed = useMemo(() => views.filter((v) => v.isClimbed), [views]);
  const cols = `repeat(${Math.max(selected.length, 1)}, minmax(0, 1fr))`;

  return (
    <>
      <PageHeader title="山を比較" back="/mountains">
        <button class="icon-btn" aria-label="比較する山を選ぶ" onClick={() => setPicking(true)}>
          <Icon name="plus" />
        </button>
      </PageHeader>
      <div class="page">
        <div class="chips">
          {selected.map((v) => (
            <button type="button" class="chip on" key={v.mountain.id} onClick={() => toggleCompare(v.mountain.id)} aria-label={`${v.mountain.name}を比較から外す`}>
              {v.mountain.name}
              <Icon name="x" size={14} class="x" />
            </button>
          ))}
          {selected.length < MAX_COMPARE && (
            <button type="button" class="chip add" onClick={() => setPicking(true)} data-testid="compare-add">
              <Icon name="plus" size={15} />
              山を選ぶ
            </button>
          )}
          {selected.length > 0 && (
            <button type="button" class="chip" onClick={() => setUi({ compareIds: [] })}>
              クリア
            </button>
          )}
        </div>

        {selected.length < 2 ? (
          <Empty icon="⚖️">
            2〜3座を選ぶと、標高・距離・累積標高・難しさ・特徴などを並べて比較できます。
            <br />
            山一覧の比較ボタン（右上）からも選べます。
            <br />
            <button class="btn primary small" style={{ marginTop: '12px' }} onClick={() => setPicking(true)}>
              山を選ぶ
            </button>
          </Empty>
        ) : (
          <>
            <div class="cmp" data-testid="compare-table">
              <div class="cmp-head" style={{ gridTemplateColumns: cols }}>
                {selected.map((v) => (
                  <div key={v.mountain.id}>
                    <a href={`#/mountains/${v.mountain.id}`}>{v.mountain.name}</a>
                  </div>
                ))}
              </div>
              {rows.map((row) => (
                <div class="cmp-row" key={row.id} data-row={row.id}>
                  <div class="cr-label">
                    {row.label}
                    {row.prefer === 'min' && <span style={{ fontWeight: 500 }}>（◎=小さい）</span>}
                    {row.prefer === 'max' && <span style={{ fontWeight: 500 }}>（◎=高い）</span>}
                  </div>
                  <div class="cr-cells" style={{ gridTemplateColumns: cols }}>
                    {row.cells.map((c, i) => {
                      if (c.kind === 'tags') {
                        return (
                          <div class="cr-cell tagcell" key={i}>
                            {c.labels.length ? c.labels.map((l) => <span class={`tag ${row.id === 'danger' ? 'danger' : ''}`} key={l}>{l}</span>) : <span class="muted">—</span>}
                          </div>
                        );
                      }
                      if (c.kind === 'text') {
                        return (
                          <div class="cr-cell" key={i}>
                            {c.text}
                          </div>
                        );
                      }
                      return (
                        <div class={`cr-cell numv ${c.best ? 'best' : ''}`} key={i}>
                          {c.text}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div class="hint">◎ は「楽・短い・近い」または「景観・楽しさが高い」側。評価は自分の評価（未踏は予想）です。</div>

            <Card title="自分の既登山と比べると" icon="🧭" testId="compare-benchmark">
              {climbed.length === 0 ? (
                <div class="hint">登頂済みの山が登録されると、自分の経験を基準にした比較が表示されます。</div>
              ) : (
                <div class="list">
                  {selected.map((v) => {
                    const lines = benchmarkAgainst(v, climbed);
                    const heads = benchmarkHeadline(lines, 4);
                    return (
                      <div key={v.mountain.id}>
                        <div style={{ fontWeight: 700, marginBottom: '4px' }}>{v.mountain.name}</div>
                        {heads.length ? (
                          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14px' }}>
                            {heads.map((h) => (
                              <li key={h}>{h}</li>
                            ))}
                          </ul>
                        ) : (
                          <div class="hint">比較できる数値がありません</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
      {picking && <PickerSheet onClose={() => setPicking(false)} />}
    </>
  );
}
