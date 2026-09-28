/**
 * 端末内バックアップ（IndexedDB 内のスナップショット）。
 * 誤操作やインポート失敗からの復旧用。端末故障に備えて JSON エクスポートも併用すること。
 */
import type { BackupSnapshot, Dataset } from '../domain/types';
import { newId, nowIso } from '../domain/util';
import { serializeDataset } from './exportImport';

export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTO_BACKUPS = 7;
export const MAX_OTHER_BACKUPS = 10;

export function makeSnapshot(data: Dataset, reason: BackupSnapshot['reason'], now = nowIso()): BackupSnapshot {
  return {
    id: newId('bak'),
    createdAt: now,
    reason,
    summary: { mountains: data.mountains.length, records: data.records.length, tags: data.tags.filter((t) => !t.builtin).length },
    payload: serializeDataset(data, now),
  };
}

export function shouldAutoBackup(data: Dataset, lastAt: string | undefined, now = new Date()): boolean {
  if (!data.settings.autoBackup) return false;
  if (data.mountains.length === 0 && data.records.length === 0) return false;
  if (!lastAt) return true;
  return now.getTime() - new Date(lastAt).getTime() >= AUTO_BACKUP_INTERVAL_MS;
}

/** 保存数の上限を超えた古いスナップショットの ID を返す */
export function backupsToPrune(list: BackupSnapshot[]): string[] {
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const auto = sorted.filter((b) => b.reason === 'auto');
  const other = sorted.filter((b) => b.reason !== 'auto');
  return [...auto.slice(MAX_AUTO_BACKUPS), ...other.slice(MAX_OTHER_BACKUPS)].map((b) => b.id);
}

export const BACKUP_REASON_LABEL: Record<BackupSnapshot['reason'], string> = {
  auto: '自動',
  manual: '手動',
  'before-import': 'インポート前',
  'before-reset': 'リセット前',
};
