import { cx } from '../../lib/cx';

type Props = { label: string; value: number; max?: number; valueText: string; tone?: 'brand' | 'ok' | 'warn' | 'crit' };
const fill = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit' };

/** Horizontal meter (role="meter"); the width is the one allowed computed inline style. */
export function Meter({ label, value, max = 100, valueText, tone = 'brand' }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}
         className="h-2 w-full rounded-sm bg-sunken">
      <div className={cx('h-2 rounded-sm', fill[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
