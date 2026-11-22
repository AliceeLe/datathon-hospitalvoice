import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Tone = 'default' | 'brand' | 'crit' | 'ok';
type Props = {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  tone?: Tone;
  layout?: 'stack' | 'row' | 'hero';
  busy?: boolean;
  pressed?: boolean;
};

const tones: Record<Tone, { tile: string; well: string }> = {
  default: { tile: 'bg-surface border-line-strong hover:border-brand-line', well: 'bg-sunken text-ink' },
  brand: { tile: 'bg-brand-soft border-brand-line hover:border-brand', well: 'bg-surface text-brand' },
  crit: { tile: 'bg-crit-soft border-crit-line hover:border-crit', well: 'bg-surface text-crit' },
  ok: { tile: 'bg-ok-soft border-ok-line hover:border-ok', well: 'bg-surface text-ok' },
};

/** Big one-tap answer: icon + 1–2 word label, at least 96px high (row layout: 80px, full width). */
export function ChoiceTile({ icon, label, onSelect, tone = 'default', layout = 'stack', busy = false, pressed }: Props) {
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      className={cx(
        'group w-full rounded-lg border text-ink transition-colors',
        layout === 'row' ? 'flex min-h-20 items-center gap-4 px-4 py-4 text-left'
          : layout === 'hero' ? 'flex min-h-56 flex-col items-center justify-center gap-4 p-6'
          : 'flex min-h-32 flex-col items-center justify-center gap-4 p-4',
        t.tile,
      )}
    >
      <span
        aria-hidden="true"
        className={cx('flex shrink-0 items-center justify-center rounded-full',
          layout === 'hero' ? 'size-20' : 'size-12', t.well)}
      >
        {icon}
      </span>
      <span className={cx('font-semibold', layout === 'hero' ? 'text-2xl' : layout === 'row' ? 'text-lg' : 'text-base')}>
        {label}
      </span>
    </button>
  );
}
