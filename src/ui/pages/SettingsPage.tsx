import { useEffect, useState } from 'preact/hooks';
import { BACKUP_REASON_LABEL } from '../../data/backup';
import { exportFileName, ImportError, parseExport, type ParseResult } from '../../data/exportImport';
import { formatDate, formatDuration } from '../../domain/format';
import type { BackupSnapshot, ThemeSetting } from '../../domain/types';
import { useStore } from '../../state/hooks';
import type { ImportMode } from '../../state/store';
import { Card, PageHeader, Segmented } from '../components/common';
import { Toggle } from '../components/fields';
import { Icon } from '../components/Icon';
import { confirmDialog, Sheet, toast } from '../components/overlay';

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ImportSheet({ text, parsed, fileName, onClose }: { text: string; parsed: ParseResult; fileName: string; onClose: () => void }) {
  const store = useStore();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const d = parsed.data;
  const skipped = Object.values(parsed.skipped).reduce((a, b) => a + b, 0);
  const run = async () => {
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: '今のデータを置き換えますか？',
        message: '現在のデータはすべてファイルの内容に置き換わります。\n（実行前に端末内バックアップを自動で作成します）',
        okLabel: '置き換える',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await store.importJson(text, mode);
      const msg =
        mode === 'merge' && res.report
          ? `統合しました（山 +${res.report.mountains.added}/更新${res.report.mountains.updated}、記録 +${res.report.records.added}/更新${res.report.records.updated}）`
          : `読み込みました（山${res.counts.mountains}座・記録${res.counts.records}件）`;
      toast(msg);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '読み込みに失敗しました', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="JSONを読み込む"
      onClose={onClose}
      testId="import-sheet"
      footer={
        <>
          <button class="btn" onClick={onClose}>
            キャンセル
          </button>
          <button class="btn primary" onClick={run} disabled={busy} data-testid="run-import">
            {mode === 'merge' ? '統合する' : '置き換える'}
          </button>
        </>
      }
    >
      <div class="card flat">
        <div class="small muted">{fileName}</div>
        <dl class="kv" style={{ marginTop: '6px' }}>
          <dt>作成日時</dt>
          <dd>{formatDateTime(parsed.exportedAt)}</dd>
          <dt>山</dt>
          <dd>{d.mountains.length}座</dd>
          <dt>山行記録</dt>
          <dd>{d.records.length}件</dd>
          <dt>タグ</dt>
          <dd>
            {d.tags.length}件（カスタム {d.tags.filter((t) => !t.builtin).length}件）
          </dd>
        </dl>
        {skipped > 0 && <div class="warn-box" style={{ marginTop: '8px' }}>壊れていて読み込めない項目が {skipped} 件あります（スキップされます）。</div>}
      </div>
      <Segmented<ImportMode>
        label="読み込み方法"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'merge', label: '統合（おすすめ）' },
          { value: 'replace', label: '置き換え' },
        ]}
      />
      <div class="hint">
        {mode === 'merge'
          ? '今のデータを残したまま追加します。同じデータは更新日時が新しい方を採用します。別端末のデータを取り込むときに。'
          : '今のデータを消して、ファイルの内容で完全に置き換えます。機種変更・復元のときに。'}
      </div>
    </Sheet>
  );
}

export function SettingsPage() {
  const store = useStore();
  const s = store.state.settings;
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [importing, setImporting] = useState<{ text: string; parsed: ParseResult; fileName: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  const refreshBackups = () => store.listBackups().then(setBackups);
  useEffect(() => {
    void refreshBackups();
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)}MB 使用中`))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version]);

  const doExport = async () => {
    downloadText(store.exportJson(), exportFileName());
    await store.markExported();
    toast('JSONファイルを書き出しました');
  };

  const doShare = async () => {
    const file = new File([store.exportJson()], exportFileName(), { type: 'application/json' });
    try {
      await navigator.share({ files: [file], title: '山ノート バックアップ' });
      await store.markExported();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('共有できませんでした', 'error');
    }
  };
  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });

  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      setImporting({ text, parsed: parseExport(text), fileName: file.name });
    } catch (err) {
      toast(err instanceof ImportError ? err.message : '読み込めませんでした', 'error');
    }
  };

  const restore = async (b: BackupSnapshot) => {
    const ok = await confirmDialog({
      title: 'このバックアップに戻しますか？',
      message: `${formatDateTime(b.createdAt)}（山${b.summary.mountains}座・記録${b.summary.records}件）\n現在のデータは置き換わります（直前の状態も自動でバックアップされます）。`,
      okLabel: '復元する',
      danger: true,
    });
    if (!ok) return;
    await store.restoreBackup(b.id);
    toast('バックアップから復元しました');
  };

  return (
    <>
      <PageHeader title="設定" />
      <div class="page">
        <Card title="データのバックアップ" icon="💾" testId="data-card">
          <div class="info-box">
            データはこの端末のブラウザ内（IndexedDB）に保存されています。機種変更や故障に備えて、定期的にJSONで書き出してください。
          </div>
          <dl class="kv" style={{ margin: '10px 0' }}>
            <dt>最終書き出し</dt>
            <dd>{s.lastExportAt ? formatDateTime(s.lastExportAt) : 'まだありません'}</dd>
            <dt>保存容量</dt>
            <dd>
              {usage || '—'}
              {persisted !== null && <span class="hint">（{persisted ? '永続化済み' : 'ブラウザが削除する可能性あり'}）</span>}
            </dd>
          </dl>
          <div class="list">
            <button class="btn primary" onClick={doExport} data-testid="export-json">
              <Icon name="download" size={18} />
              JSONエクスポート（ダウンロード）
            </button>
            {canShareFiles && (
              <button class="btn" onClick={doShare}>
                <Icon name="share" size={18} />
                共有・ファイルに保存
              </button>
            )}
            <label class="btn" data-testid="import-json">
              <Icon name="upload" size={18} />
              JSONインポート
              <input type="file" accept="application/json,.json" class="sr-only" onChange={onFile} data-testid="import-file" />
            </label>
          </div>
        </Card>

        <Card title="端末内バックアップ" icon="🗂️" testId="backups-card">
          <Toggle label="自動バックアップ" hint="1日1回、起動時に端末内へスナップショットを保存（最大7件）" checked={s.autoBackup} onChange={(v) => store.updateSettings({ autoBackup: v })} />
          <button
            class="btn small"
            onClick={async () => {
              await store.createBackup('manual');
              await refreshBackups();
              toast('端末内にバックアップを作成しました');
            }}
            data-testid="create-backup"
          >
            今すぐバックアップ
          </button>
          <div style={{ marginTop: '6px' }}>
            {backups.length === 0 && <div class="hint">まだバックアップはありません。</div>}
            {backups.map((b) => (
              <div class="backup-item" key={b.id}>
                <div class="bi-main">
                  <div>
                    {formatDateTime(b.createdAt)} <span class="tag">{BACKUP_REASON_LABEL[b.reason]}</span>
                  </div>
                  <div class="hint">
                    山{b.summary.mountains}座・記録{b.summary.records}件
                  </div>
                </div>
                <button class="btn small" onClick={() => restore(b)}>
                  復元
                </button>
                <button class="icon-btn" aria-label="このバックアップをダウンロード" onClick={() => downloadText(b.payload, `yama-note-snapshot-${b.createdAt.slice(0, 10)}.json`)}>
                  <Icon name="download" size={18} />
                </button>
              </div>
            ))}
          </div>
          <div class="hint">端末内バックアップはブラウザのデータ削除で一緒に消えます。大切なデータはJSONエクスポートも併用してください。</div>
        </Card>

        <Card title="タグ・カテゴリ" icon="🏷️">
          <a class="btn block" href="#/settings/tags">
            タグとカテゴリを管理
            <Icon name="right" size={18} />
          </a>
          <div class="hint" style={{ marginTop: '6px' }}>
            {store.derived.tagIndex.categories.length}カテゴリ・{store.state.tags.filter((t) => !t.hidden).length}タグ（カスタム {store.state.tags.filter((t) => !t.builtin).length}）
          </div>
        </Card>

        <Card title="表示" icon="🎨">
          <Segmented<ThemeSetting>
            label="テーマ"
            value={s.theme}
            onChange={(v) => store.updateSettings({ theme: v })}
            options={[
              { value: 'auto', label: '自動' },
              { value: 'light', label: 'ライト' },
              { value: 'dark', label: 'ダーク' },
            ]}
          />
        </Card>

        <Card title="提案の設定" icon="🧭">
          <div class="field">
            <span class="label">「近場」とみなす片道時間：{formatDuration(s.nearbyMinutes)}</span>
            <div class="segmented">
              {[60, 90, 120, 150, 180].map((m) => (
                <button type="button" key={m} aria-pressed={s.nearbyMinutes === m} onClick={() => store.updateSettings({ nearbyMinutes: m })}>
                  {m % 60 ? `${Math.floor(m / 60)}.5h` : `${m / 60}h`}
                </button>
              ))}
            </div>
          </div>
          <div class="field">
            <label for="home-area">自宅エリア（メモ）</label>
            <input id="home-area" class="input" value={s.homeArea} placeholder="例: 東京都西部" onChange={(e) => store.updateSettings({ homeArea: (e.target as HTMLInputElement).value })} />
            <div class="hint">各山の「アクセス時間」はこの場所からの目安として入力してください。</div>
          </div>
        </Card>

        <Card title="サンプルデータ" icon="🧪">
          <div class="hint" style={{ marginBottom: '8px' }}>
            操作感を試すための山{16}座・記録8件。数値は目安です。自分のデータとは別に一括削除できます。
          </div>
          {store.hasSample() ? (
            <button
              class="btn block"
              onClick={async () => {
                if (await confirmDialog({ title: 'サンプルデータを削除しますか？', message: '自分で登録したデータは残ります。', okLabel: '削除', danger: true })) {
                  await store.removeSample();
                  toast('サンプルデータを削除しました');
                }
              }}
            >
              サンプルデータを削除
            </button>
          ) : (
            <button
              class="btn block"
              onClick={async () => {
                await store.loadSample();
                toast('サンプルデータを読み込みました');
              }}
            >
              サンプルデータを読み込む
            </button>
          )}
        </Card>

        <Card title="リセット" icon="⚠️">
          <button
            class="btn danger block"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'すべてのデータを削除しますか？',
                message: '山・山行記録・カスタムタグがすべて消えます。\n（実行前に端末内バックアップを自動作成します）',
                okLabel: 'すべて削除',
                danger: true,
              });
              if (!ok) return;
              await store.resetAll();
              toast('データを初期化しました');
            }}
          >
            すべてのデータを削除
          </button>
        </Card>

        <Card title="このアプリについて" icon="ℹ️">
          <dl class="kv">
            <dt>アプリ</dt>
            <dd>山ノート v{__APP_VERSION__}</dd>
            <dt>保存先</dt>
            <dd>この端末のみ（アカウント不要）</dd>
            <dt>オフライン</dt>
            <dd>{'serviceWorker' in navigator && navigator.serviceWorker.controller ? '対応（キャッシュ済み）' : 'ホーム画面に追加すると利用可'}</dd>
            <dt>記録開始</dt>
            <dd>{formatDate([...store.state.records].sort((a, b) => a.date.localeCompare(b.date))[0]?.date)}</dd>
          </dl>
          <div class="hint" style={{ marginTop: '8px' }}>
            ホーム画面に追加: iPhoneはSafariの共有メニュー →「ホーム画面に追加」、AndroidはChromeのメニュー →「アプリをインストール」。
          </div>
        </Card>
      </div>
      {importing && (
        <ImportSheet
          {...importing}
          onClose={() => {
            setImporting(null);
            void refreshBackups();
          }}
        />
      )}
    </>
  );
}
