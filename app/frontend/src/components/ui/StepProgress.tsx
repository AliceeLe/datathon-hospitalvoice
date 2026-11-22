import { cx } from '../../lib/cx';

type Props = { step: number; total?: number; label: string };

/** Segmented progress bar for the 3-step flow. */
export function StepProgress({ step, total = 3, label }: Props) {
  return (
    <div role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={label}
         className="flex flex-1 gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx('h-2 flex-1 rounded-sm', i < step ? 'bg-brand' : 'bg-line')} />
      ))}
    </div>
  );
}
