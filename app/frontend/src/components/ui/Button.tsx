import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Variant = 'primary' | 'outline' | 'ghost' | 'soft';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode; size?: 'md' | 'lg' };

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand border-brand hover:bg-brand-strong disabled:bg-brand-line disabled:border-brand-line',
  outline: 'bg-surface text-ink border-line hover:border-line-strong',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-sunken hover:text-ink',
  soft: 'bg-brand-soft text-brand border-transparent',
};

export function Button({ variant = 'outline', icon, size = 'md', className, children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors',
        'disabled:cursor-not-allowed',
        size === 'lg' ? 'min-h-12 px-6 text-base' : 'min-h-10 px-4 text-sm',
        variants[variant], className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
