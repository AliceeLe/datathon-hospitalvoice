import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Opt<T extends string> = { value: T; label: string; icon?: ReactNode };
type Props<T extends string> = { label: string; options: Opt<T>[]; value: T | null; onChange: (v: T) => void; multiple?: false }
  | { label: string; options: Opt<T>[]; value: T[]; onChange: (v: T[]) => void; multiple: true };

/** Row of chip-sized choices: radiogroup for one answer, aria-pressed toggles for several. */
export function OptionGroup<T extends string>(props: Props<T>) {
  const { label, options } = props;
  const isOn = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const pick = (v: T) => {
    if (props.multiple) props.onChange(isOn(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    else props.onChange(v);
  };
  return (
    <div role={props.multiple ? 'group' : 'radiogroup'} aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button"
                {...(props.multiple ? { 'aria-pressed': isOn(o.value) } : { role: 'radio', 'aria-checked': isOn(o.value) })}
                onClick={() => pick(o.value)}
                className={cx('inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-base font-medium',
                  isOn(o.value) ? 'border-brand bg-brand-soft text-brand' : 'border-line-strong bg-surface text-ink hover:border-brand-line')}>
          {o.icon && <span aria-hidden="true">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
