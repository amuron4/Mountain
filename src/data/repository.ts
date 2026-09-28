/**
 * 永続化層のインターフェース。
 * UI・状態管理はこのインターフェースだけに依存する。IndexedDB 実装（idbRepository.ts）と
 * テスト用のメモリ実装（memoryRepository.ts）があり、将来はクラウド同期付き実装に差し替えられる。
 * すべての変更は ChangeSet 単位でアトミックに適用する（同期時は ChangeSet をそのまま送れる）。
 */
import type { BackupSnapshot, ChangeSet, Dataset, ID } from '../domain/types';

export interface Repository {
  loadAll(): Promise<Dataset>;
  apply(changes: ChangeSet): Promise<void>;
  /** 全データを置き換える（インポート「置き換え」・リセット用） */
  replaceAll(data: Dataset): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
  listBackups(): Promise<BackupSnapshot[]>;
  saveBackup(snapshot: BackupSnapshot): Promise<void>;
  deleteBackup(id: ID): Promise<void>;
}
