import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

type Props = { open: boolean; title: string; onClose: () => void; closeLabel: string; children: ReactNode; footer?: ReactNode };

/** Modal built on <dialog>: focus trap, Esc to close, backdrop. */
export function Dialog({ open, title, onClose, closeLabel, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-label={title}
            className="m-auto w-[min(560px,calc(100%-32px))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-ink/40">
      <div className="flex items-center gap-4 border-b border-line px-6 py-4">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        <IconButton label={closeLabel} icon={<X className="size-5" aria-hidden="true" />} onClick={onClose} />
      </div>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-6">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
    </dialog>
  );
}
