import type { ReactNode } from 'react';

type Props = { icon: ReactNode; label: string; onClick: () => void; actionLabel: string };

/** A previous answer. Tapping it goes back to that question. */
export function Chip({ icon, label, onClick, actionLabel }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${actionLabel}: ${label}`}
      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-base font-medium text-ink hover:border-brand-line"
    >
      <span aria-hidden="true" className="text-ink-muted">{icon}</span>
      {label}
    </button>
  );
}
