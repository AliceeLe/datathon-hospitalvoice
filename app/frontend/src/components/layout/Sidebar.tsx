import { ClipboardList, Hospital, Search, SquarePen, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { legacyUrl, type StoredChat } from '../../lib/chats';
import { IconButton } from '../ui/IconButton';

type Props = {
  chats: StoredChat[];
  t: (k: 'newChat' | 'search' | 'tracker' | 'recentChats' | 'noChats' | 'closeMenu') => string;
  onNewChat: () => void;
  open: boolean;           // mobile drawer state
  onClose: () => void;
  footer?: ReactNode;      // mobile-only extras (language switch)
};

function NavLink({ href, onClick, icon, children, kbd }: { href?: string; onClick?: () => void; icon: ReactNode; children: ReactNode; kbd?: string }) {
  const cls = 'flex min-h-12 w-full items-center gap-4 rounded-md px-4 text-sm font-medium text-ink-muted hover:bg-sunken hover:text-ink';
  const inner = (<><span aria-hidden="true">{icon}</span><span className="flex-1 text-left">{children}</span>
    {kbd && <kbd className="rounded-sm border border-line px-2 font-mono text-xs text-ink-subtle">{kbd}</kbd>}</>);
  return href ? <a className={cls} href={href}>{inner}</a> : <button type="button" className={cls} onClick={onClick}>{inner}</button>;
}

export function Sidebar({ chats, t, onNewChat, open, onClose, footer }: Props) {
  return (
    <aside
      className={cx(
        'flex w-64 shrink-0 flex-col border-r border-line bg-surface lg:sticky lg:top-0 lg:h-screen',
        'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-72 max-lg:transition-transform',
        open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
      )}
    >
      <div className="flex h-16 items-center gap-4 border-b border-line px-4">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-brand text-on-brand">
          <Hospital className="size-5" />
        </span>
        <span className="flex-1 text-base font-semibold">HospitalVoice</span>
        <IconButton className="lg:hidden" label={t('closeMenu')} icon={<X className="size-5" aria-hidden="true" />} onClick={onClose} />
      </div>
      <nav className="flex flex-col gap-2 p-2 pt-4">
        <NavLink onClick={onNewChat} icon={<SquarePen className="size-4" />}>{t('newChat')}</NavLink>
        <NavLink href={legacyUrl('search')} icon={<Search className="size-4" />} kbd="Ctrl K">{t('search')}</NavLink>
        <NavLink href={legacyUrl('tracker')} icon={<ClipboardList className="size-4" />}>{t('tracker')}</NavLink>
      </nav>
      <div className="px-4 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('recentChats')}</div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {chats.length === 0 && <li className="px-4 py-2 text-sm text-ink-subtle">{t('noChats')}</li>}
        {chats.slice(0, 20).map((c) => (
          <li key={c.id}>
            <a href={legacyUrl(`chat=${encodeURIComponent(c.id)}`)} title={c.title}
               className="flex min-h-12 items-center truncate rounded-md px-4 text-sm text-ink-muted hover:bg-sunken hover:text-ink">
              <span className="truncate">{c.title}</span>
            </a>
          </li>
        ))}
      </ul>
      {footer && <div className="border-t border-line p-4 lg:hidden">{footer}</div>}
    </aside>
  );
}
