import { LayoutGrid, Menu, Mic, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { legacyUrl } from '../../lib/chats';
import { IconButton } from '../ui/IconButton';

type Props = {
  t: (k: 'findFacility' | 'planner' | 'readAloud' | 'menu') => string;
  readAloud: boolean;
  onToggleReadAloud: () => void;
  onOpenMenu: () => void;
  languageSwitch: ReactNode;   // desktop placement
};

export function TopBar({ t, readAloud, onToggleReadAloud, onOpenMenu, languageSwitch }: Props) {
  const tab = 'inline-flex min-h-12 items-center gap-2 rounded-md px-4 text-sm font-medium';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface px-4 lg:px-8">
      <IconButton className="lg:hidden" shape="square" label={t('menu')} icon={<Menu className="size-5" aria-hidden="true" />} onClick={onOpenMenu} />
      <nav aria-label={t('findFacility')} className="flex min-w-0 items-center gap-2">
        <a href="/" aria-current="page" className={cx(tab, 'bg-brand-soft text-brand')}>
          <Mic className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">{t('findFacility')}</span>
        </a>
        <a href={legacyUrl('planner')} className={cx(tab, 'text-ink-muted hover:bg-sunken hover:text-ink')}>
          <LayoutGrid className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">{t('planner')}</span>
        </a>
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <div className="max-lg:hidden">{languageSwitch}</div>
        <button
          type="button"
          aria-pressed={readAloud}
          onClick={onToggleReadAloud}
          className={cx('inline-flex min-h-12 items-center gap-2 rounded-md border px-4 text-sm font-medium',
            readAloud ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink hover:border-line-strong')}
        >
          {readAloud ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
          <span className="max-sm:sr-only">{t('readAloud')}</span>
        </button>
      </div>
    </header>
  );
}
