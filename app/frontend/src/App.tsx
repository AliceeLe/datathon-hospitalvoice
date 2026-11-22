import { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { SegmentedControl } from './components/ui/SegmentedControl';
import { FindFacility } from './features/find/FindFacility';
import { loadChats } from './lib/chats';
import { LANGS, useLang, type Lang } from './lib/i18n';
import { stopSpeaking } from './lib/speech';

const READ_KEY = 'hospitalvoice_read_aloud';

export default function App() {
  const { lang, setLang, t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const [readAloud, setReadAloud] = useState(() => {
    try { return localStorage.getItem(READ_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(READ_KEY, readAloud ? '1' : '0'); } catch { /* ignore */ }
    if (!readAloud) stopSpeaking();
  }, [readAloud]);

  const langSwitch = (
    <SegmentedControl<Lang> label={t('language')} value={lang} onChange={setLang}
      options={LANGS.map((l) => ({ value: l.code, label: l.native, lang: l.code }))} />
  );

  return (
    <div className="min-h-full lg:flex">
      <Sidebar chats={loadChats()} t={t} open={menuOpen} onClose={() => setMenuOpen(false)} footer={langSwitch}
               onNewChat={() => { setFlowKey((k) => k + 1); setMenuOpen(false); }} />
      {menuOpen && (
        <button type="button" aria-label={t('closeMenu')} onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-30 bg-ink/40 lg:hidden" />
      )}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar t={t} readAloud={readAloud} onToggleReadAloud={() => setReadAloud((v) => !v)}
                onOpenMenu={() => setMenuOpen(true)} languageSwitch={langSwitch} />
        <main className="flex-1">
          <FindFacility key={flowKey} lang={lang} t={t} readAloud={readAloud} />
        </main>
      </div>
    </div>
  );
}
