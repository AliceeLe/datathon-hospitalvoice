import { cx } from '../../lib/cx';

type Option<T extends string> = { value: T; label: string; lang?: string };
type Props<T extends string> = { options: Option<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string };

/** Toggle group (aria-pressed). Used for the language switch. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex rounded-md border border-line bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.lang}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-10 min-w-12 rounded-sm px-4 text-sm font-medium transition-colors',
            o.value === value ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
