import { Info } from 'lucide-react';
import { useId, useState } from 'react';

/** Info icon that reveals a short note (e.g. a data source) on hover, focus or tap. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
              onClick={() => setOpen((v) => !v)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              className="inline-flex size-8 items-center justify-center rounded-full text-ink-subtle hover:bg-sunken hover:text-ink">
        <Info className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip"
              className="absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-line bg-surface p-4 text-xs font-normal leading-relaxed text-ink-muted max-sm:left-auto max-sm:right-0 max-sm:translate-x-0">
          {text}
        </span>
      )}
    </span>
  );
}
