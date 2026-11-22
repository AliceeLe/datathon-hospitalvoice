import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;               // required: becomes aria-label and tooltip
  icon: ReactNode;
  shape?: 'round' | 'square';
  tone?: 'default' | 'brand';
};

/** Icon-only button with a 48px touch target and a required accessible label. */
export function IconButton({ label, icon, shape = 'round', tone = 'default', className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-12 shrink-0 items-center justify-center border transition-colors',
        shape === 'round' ? 'rounded-full' : 'rounded-md',
        tone === 'brand' ? 'border-brand bg-brand text-on-brand hover:bg-brand-strong disabled:border-brand-line disabled:bg-brand-line'
                         : 'border-line bg-surface text-ink hover:border-line-strong',
        'disabled:cursor-not-allowed', className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
