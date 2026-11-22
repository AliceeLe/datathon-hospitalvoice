import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'crit';
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand border-brand-line',
  ok: 'bg-ok-soft text-ok border-ok-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  crit: 'bg-crit-soft text-crit border-crit-line',
};

/** Small label. Status tones (ok/warn/crit) carry clinical meaning only; always paired with text. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
