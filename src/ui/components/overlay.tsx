/**
 * トースト・確認ダイアログ・ボトムシート。
 * toast() / confirmDialog() はどこからでも呼べる（App 直下の <Overlays /> が描画する）。
 */
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { useExternalStore } from '../../state/hooks';
import { Icon } from './Icon';

interface ToastState {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface ConfirmState {
  title: string;
  message?: string;
  okLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

let toastState: ToastState | null = null;
let confirmState: ConfirmState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};

export function toast(text: string, kind: ToastState['kind'] = 'info') {
  const id = ++seq;
  toastState = { id, text, kind };
  emit();
  setTimeout(() => {
    if (toastState?.id === id) {
      toastState = null;
      emit();
    }
  }, kind === 'error' ? 4500 : 2600);
}

export function confirmDialog(opts: { title: string; message?: string; okLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = {
      title: opts.title,
      message: opts.message,
      okLabel: opts.okLabel ?? 'OK',
      cancelLabel: opts.cancelLabel ?? 'キャンセル',
      danger: !!opts.danger,
      resolve,
    };
    emit();
  });
}

function closeConfirm(v: boolean) {
  const c = confirmState;
  confirmState = null;
  emit();
  c?.resolve(v);
}

const subscribeOverlay = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function Overlays() {
  useExternalStore(subscribeOverlay, () => version);
  return (
    <>
      {toastState && (
        <div class="toast-wrap" role="status" aria-live="polite">
          <div class={`toast ${toastState.kind === 'error' ? 'error' : ''}`}>{toastState.text}</div>
        </div>
      )}
      {confirmState && (
        <div class="sheet-backdrop" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && closeConfirm(false)}>
          <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{confirmState.title}</h2>
            {confirmState.message && <p>{confirmState.message}</p>}
            <div class="btn-row">
              <button class="btn" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button class={`btn ${confirmState.danger ? 'danger solid' : 'primary'}`} onClick={() => closeConfirm(true)} data-testid="confirm-ok">
                {confirmState.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  full?: boolean;
  testId?: string;
}

export function Sheet({ title, onClose, children, footer, full, testId }: SheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="x" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
