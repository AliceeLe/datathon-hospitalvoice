import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Props = InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; label: string };

/** Single-line input with an optional leading icon; label is used as the accessible name. */
export function TextField({ icon, label, className, ...rest }: Props) {
  return (
    <label className={cx('flex min-h-14 flex-1 items-center gap-4 rounded-md border border-line-strong bg-surface px-4',
                         'focus-within:border-brand', className)}>
      {icon && <span aria-hidden="true" className="text-ink-subtle">{icon}</span>}
      <span className="sr-only">{label}</span>
      <input className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-subtle focus:outline-none"
             placeholder={label} {...rest} />
    </label>
  );
}
