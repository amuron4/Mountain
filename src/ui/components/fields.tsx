import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PREFECTURES } from '../../domain/geo';
import { RATING_DEFS } from '../../domain/ratings';
import type { RatingKey, Ratings } from '../../domain/types';
import { isFiniteNumber } from '../../domain/util';
import { Icon } from './Icon';

let fieldSeq = 0;
const useFieldId = (prefix: string) => useState(() => `${prefix}-${++fieldSeq}`)[0];

export function Field({ label, required, children, hint, id }: { label: string; required?: boolean; children: ComponentChildren; hint?: string; id?: string }) {
  return (
    <div class="field">
      <label for={id}>
        {label}
        {required && <span class="req">*</span>}
      </label>
      {children}
      {hint && <div class="hint">{hint}</div>}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  list?: string;
  name?: string;
  type?: string;
}) {
  const id = useFieldId('tf');
  return (
    <Field label={props.label} required={props.required} hint={props.hint} id={id}>
      <input
        id={id}
        name={props.name}
        class="input"
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        list={props.list}
        onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
      />
    </Field>
  );
}

export function TextArea(props: { label: string; value: string; onInput: (v: string) => void; placeholder?: string; rows?: number; name?: string }) {
  const id = useFieldId('ta');
  return (
    <Field label={props.label} id={id}>
      <textarea
        id={id}
        name={props.name}
        class="textarea"
        rows={props.rows ?? 4}
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onInput((e.target as HTMLTextAreaElement).value)}
      />
    </Field>
  );
}

/** 数値入力。空欄は undefined。入力途中の文字列（"1." など）を保持する */
export function NumberField(props: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  placeholder?: string;
  decimal?: boolean;
  hint?: string;
  name?: string;
  min?: number;
}) {
  const id = useFieldId('nf');
  const [text, setText] = useState(isFiniteNumber(props.value) ? String(props.value) : '');
  useEffect(() => {
    const cur = text.trim() === '' ? undefined : Number(text.normalize('NFKC'));
    if (cur !== props.value) setText(isFiniteNumber(props.value) ? String(props.value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  return (
    <Field label={props.label} hint={props.hint} id={id}>
      <div class="input-unit">
        <input
          id={id}
          name={props.name}
          type="text"
          inputMode={props.decimal ? 'decimal' : 'numeric'}
          value={text}
          placeholder={props.placeholder}
          onInput={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            setText(raw);
            const n = raw.normalize('NFKC').replace(/,/g, '').trim();
            if (n === '') props.onChange(undefined);
            else if (Number.isFinite(Number(n))) props.onChange(Number(n));
          }}
        />
        {props.unit && <span class="unit">{props.unit}</span>}
      </div>
    </Field>
  );
}

/** 時間入力（時間・分の2欄）。値は分 */
export function DurationField(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; hint?: string; name?: string }) {
  const id = useFieldId('df');
  const h = isFiniteNumber(props.value) ? Math.floor(props.value / 60) : undefined;
  const m = isFiniteNumber(props.value) ? Math.round(props.value % 60) : undefined;
  const [hText, setH] = useState(h !== undefined ? String(h) : '');
  const [mText, setM] = useState(m !== undefined ? String(m) : '');
  useEffect(() => {
    const cur = toMinutes(hText, mText);
    if (cur !== props.value) {
      setH(h !== undefined ? String(h) : '');
      setM(m !== undefined ? String(m) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const update = (nh: string, nm: string) => {
    setH(nh);
    setM(nm);
    props.onChange(toMinutes(nh, nm));
  };
  return (
    <Field label={props.label} hint={props.hint} id={id}>
      <div class="grid-2" style={{ gap: '6px' }}>
        <div class="input-unit">
          <input id={id} name={props.name ? `${props.name}-h` : undefined} type="text" inputMode="numeric" value={hText} placeholder="0" onInput={(e) => update((e.target as HTMLInputElement).value, mText)} aria-label={`${props.label}（時間）`} />
          <span class="unit">時間</span>
        </div>
        <div class="input-unit">
          <input name={props.name ? `${props.name}-m` : undefined} type="text" inputMode="numeric" value={mText} placeholder="0" onInput={(e) => update(hText, (e.target as HTMLInputElement).value)} aria-label={`${props.label}（分）`} />
          <span class="unit">分</span>
        </div>
      </div>
    </Field>
  );
}

function toMinutes(h: string, m: string): number | undefined {
  const hn = h.normalize('NFKC').trim();
  const mn = m.normalize('NFKC').trim();
  if (hn === '' && mn === '') return undefined;
  const hv = hn === '' ? 0 : Number(hn);
  const mv = mn === '' ? 0 : Number(mn);
  if (!Number.isFinite(hv) || !Number.isFinite(mv)) return undefined;
  return Math.round(hv * 60 + mv);
}

export function Toggle({ label, checked, onChange, hint, name }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; name?: string }) {
  return (
    <label class="toggle-row">
      <span>
        <span class="t-label">{label}</span>
        {hint && <div class="hint">{hint}</div>}
      </span>
      <input class="switch" type="checkbox" role="switch" name={name} checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

/** 選択肢チップ（単一 / 複数）。allowCustom で自由入力も可能 */
export function ChipChoice(props: {
  label: string;
  options: string[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
  multiple?: boolean;
  allowCustom?: boolean;
}) {
  const values = Array.isArray(props.value) ? props.value : props.value ? [props.value] : [];
  const custom = values.filter((v) => !props.options.includes(v));
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const toggle = (opt: string) => {
    if (props.multiple) {
      props.onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt]);
    } else {
      props.onChange(values[0] === opt ? '' : opt);
    }
  };
  const commit = () => {
    const t = text.trim();
    if (t) props.onChange(props.multiple ? [...values.filter((v) => v !== t), t] : t);
    setText('');
    setAdding(false);
  };
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      <div class="chips" role="group" aria-label={props.label}>
        {[...props.options, ...custom].map((opt) => (
          <button type="button" class={`chip ${values.includes(opt) ? 'on' : ''}`} aria-pressed={values.includes(opt)} onClick={() => toggle(opt)} key={opt}>
            {opt}
          </button>
        ))}
        {props.allowCustom && !adding && (
          <button type="button" class="chip add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> その他
          </button>
        )}
      </div>
      {adding && (
        <div class="tp-add">
          <input
            class="input"
            value={text}
            autoFocus
            placeholder="自由入力"
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
          />
          <button type="button" class="btn small primary" onClick={commit}>
            追加
          </button>
        </div>
      )}
    </div>
  );
}

export function RatingInput({ ratingKey, value, onChange }: { ratingKey: RatingKey; value?: number; onChange: (v: number | undefined) => void }) {
  const def = RATING_DEFS.find((d) => d.key === ratingKey)!;
  return (
    <div class={`rating-input ${def.kind}`} role="group" aria-label={def.label}>
      <div class="r-head">
        <span>{def.label}</span>
        <span class="r-hint">
          1 {def.low} ↔ 5 {def.high}
        </span>
      </div>
      <div class="r-buttons">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-pressed={value === n}
            aria-label={`${def.label} ${n}`}
            class={value === n ? 'sel' : isFiniteNumber(value) && n < value ? 'fill' : ''}
            onClick={() => onChange(value === n ? undefined : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingsEditor({ value, onChange }: { value: Ratings; onChange: (v: Ratings) => void }) {
  return (
    <>
      {RATING_DEFS.map((d) => (
        <RatingInput
          key={d.key}
          ratingKey={d.key}
          value={value[d.key]}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) delete next[d.key];
            else next[d.key] = v;
            onChange(next);
          }}
        />
      ))}
      <div class="hint">同じ数字をもう一度タップすると未評価に戻ります。</div>
    </>
  );
}

export function RatingBars({ ratings, compact }: { ratings: Ratings; compact?: boolean }) {
  const defs = RATING_DEFS.filter((d) => isFiniteNumber(ratings[d.key]));
  if (!defs.length) return <div class="hint">まだ評価がありません</div>;
  return (
    <div class="rating-bars">
      {defs.map((d) => {
        const v = ratings[d.key]!;
        return (
          <div class={`rbar ${d.kind}`} key={d.key} title={`${d.low} ↔ ${d.high}`}>
            <span class="lbl">{d.label}</span>
            <span class="track">
              <span class="fillbar" style={{ width: `${(v / 5) * 100}%`, display: 'block' }} />
            </span>
            <span class="val">{compact ? Math.round(v) : Math.round(v * 10) / 10}</span>
          </div>
        );
      })}
    </div>
  );
}

export function PrefecturePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const id = useFieldId('pref');
  return (
    <Field label="都道府県" id={id} hint="県境の山は複数選べます">
      <select
        id={id}
        class="select"
        value=""
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v && !value.includes(v)) onChange([...value, v]);
          (e.target as HTMLSelectElement).value = '';
        }}
      >
        <option value="">＋ 都道府県を追加</option>
        {PREFECTURES.map((p) => (
          <option value={p} key={p} disabled={value.includes(p)}>
            {p}
          </option>
        ))}
      </select>
      {value.length > 0 && (
        <div class="chips">
          {value.map((p) => (
            <button type="button" class="chip on" key={p} onClick={() => onChange(value.filter((x) => x !== p))} aria-label={`${p}を外す`}>
              {p}
              <Icon name="x" size={14} class="x" />
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

export function WishInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const labels = ['なし', '気になる', '行きたい', '次に行く！'];
  return (
    <div class="field">
      <span class="label">行きたい度</span>
      <div class="segmented" role="group" aria-label="行きたい度">
        {labels.map((l, i) => (
          <button type="button" key={i} aria-pressed={value === i} onClick={() => onChange(i)}>
            {i > 0 ? `${'★'.repeat(i)}` : l}
          </button>
        ))}
      </div>
      <div class="hint">{labels[value]}</div>
    </div>
  );
}
