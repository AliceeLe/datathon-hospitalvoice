import { LayoutGrid, Menu, Mic, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { href } from '../../lib/router';
import { IconButton } from '../ui/IconButton';

type Props = {
  t: (k: string) => string; tab: 'find' | 'planner' | null;
  readAloud: boolean; onToggleReadAloud: () => void; onOpenMenu: () => void;
  languageSwitch: ReactNode;   // desktop placement
};

export function TopBar({ t, tab, readAloud, onToggleReadAloud, onOpenMenu, languageSwitch }: Props) {
  const base = 'inline-flex min-h-12 items-center gap-2 rounded-md px-4 text-sm font-medium';
  const on = 'bg-brand-soft text-brand', off = 'text-ink-muted hover:bg-sunken hover:text-ink';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-surface px-4 lg:px-8">
      <IconButton className="lg:hidden" shape="square" label={t('menu')} icon={<Menu className="size-5" aria-hidden="true" />} onClick={onOpenMenu} />
      <nav aria-label="HospitalVoice" className="flex min-w-0 items-center gap-2">
        <a href={href.find} aria-current={tab === 'find' ? 'page' : undefined} className={cx(base, tab === 'find' ? on : off)}>
          <Mic className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">{t('findFacility')}</span>
        </a>
        <a href={href.planner} aria-current={tab === 'planner' ? 'page' : undefined} className={cx(base, tab === 'planner' ? on : off)}>
          <LayoutGrid className="size-4" aria-hidden="true" /><span className="max-sm:sr-only">{t('planner')}</span>
        </a>
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <div className="max-lg:hidden">{languageSwitch}</div>
        <button type="button" aria-pressed={readAloud} onClick={onToggleReadAloud}
                className={cx('inline-flex min-h-12 items-center gap-2 rounded-md border px-4 text-sm font-medium',
                  readAloud ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink hover:border-line-strong')}>
          {readAloud ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
          <span className="max-sm:sr-only">{t('readAloud')}</span>
        </button>
      </div>
    </header>
  );
}
