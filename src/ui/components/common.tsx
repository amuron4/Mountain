import type { ComponentChildren } from 'preact';
import { goBack } from '../../state/router';
import { Icon } from './Icon';

interface HeaderProps {
  title: string;
  sub?: string;
  back?: string | boolean;
  children?: ComponentChildren;
}

/** 画面上部の固定ヘッダー。back に文字列を渡すと履歴が無いときの戻り先になる */
export function PageHeader({ title, sub, back, children }: HeaderProps) {
  return (
    <header class="page-header">
      <div class="page-header-inner">
        {back && (
          <button class="icon-btn" aria-label="戻る" onClick={() => goBack(typeof back === 'string' ? back : '/')}>
            <Icon name="back" />
          </button>
        )}
        <h1>
          {title}
          {sub && <span class="sub">{sub}</span>}
        </h1>
        {children}
      </div>
    </header>
  );
}

interface FoldProps {
  title: string;
  icon?: string;
  meta?: ComponentChildren;
  open?: boolean;
  inner?: boolean;
  children: ComponentChildren;
  testId?: string;
  class?: string;
}

/** 折りたたみセクション（ネイティブ <details> で軽量・アクセシブルに） */
export function Fold({ title, icon, meta, open, inner, children, testId, class: cls }: FoldProps) {
  return (
    <details class={`fold ${inner ? 'inner' : ''} ${cls ?? ''}`} open={open} data-testid={testId}>
      <summary>
        {icon && <span class="s-icon">{icon}</span>}
        <span>{title}</span>
        {meta !== undefined && <span class="s-meta">{meta}</span>}
        <Icon name="down" size={18} class={meta !== undefined ? 'chev' : 'chev ml-auto'} />
      </summary>
      <div class="fold-body">{children}</div>
    </details>
  );
}

export function Card({ title, icon, more, children, testId }: { title?: string; icon?: string; more?: { href: string; label: string }; children: ComponentChildren; testId?: string }) {
  return (
    <section class="card" data-testid={testId}>
      {title && (
        <h2 class="card-title">
          {icon && <span aria-hidden="true">{icon}</span>}
          {title}
          {more && (
            <a class="more" href={more.href}>
              {more.label}
              <Icon name="right" size={16} />
            </a>
          )}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon = '🏔️', children }: { icon?: string; children: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="big" aria-hidden="true">
        {icon}
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} key={o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Metric({ k, v, icon, src }: { k: string; v: string; icon?: string; src?: string }) {
  const none = v === '—';
  return (
    <div class="metric">
      <div class="k">
        {icon && <Icon name={icon} size={12} strokeWidth={2.2} />}
        {k}
      </div>
      <div class={`v ${none ? 'none' : ''}`}>{splitUnit(v)}</div>
      {src && <div class="src">{src}</div>}
    </div>
  );
}

/** 「1,270m」→ 数値と単位を分け、単位を小さく表示（狭い幅でも数値が切れないように） */
function splitUnit(v: string) {
  const m = v.match(/^([\d,.:]+)(km|m|回|分)$/);
  if (!m) return v;
  return (
    <>
      {m[1]}
      <small>{m[2]}</small>
    </>
  );
}

export function StatusBadge({ status }: { status: 'unclimbed' | 'climbed' | 'revisit' }) {
  const label = { unclimbed: '未踏', climbed: '登頂済み', revisit: '再訪したい' }[status];
  return <span class={`status ${status}`}>{label}</span>;
}

export function Wish({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span class="wish" aria-label={`行きたい度${n}`} title={`行きたい度${n}`}>
      {'★'.repeat(n)}
    </span>
  );
}
