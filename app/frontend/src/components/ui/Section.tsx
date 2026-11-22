import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { InfoTip } from './InfoTip';

type Props = { title: string; icon?: ReactNode; source?: string; sourceLabel?: string; actions?: ReactNode; children: ReactNode; className?: string };

/** Titled block. Data sources go in the info tooltip, not in a paragraph. */
export function Section({ title, icon, source, sourceLabel = 'Source', actions, children, className }: Props) {
  return (
    <section className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center gap-2">
        {icon && <span aria-hidden="true" className="text-ink-muted">{icon}</span>}
        <h2 className="text-lg font-semibold">{title}</h2>
        {source && <InfoTip label={sourceLabel} text={source} />}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
