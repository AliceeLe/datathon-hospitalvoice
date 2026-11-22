import { useEffect, useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { SegmentedControl } from './components/ui/SegmentedControl';
import { FindFacility } from './features/find/FindFacility';
import { PlannerView } from './features/planner/PlannerView';
import { ResultsView } from './features/results/ResultsView';
import { SearchDialog } from './features/search/SearchDialog';
import { TrackerView } from './features/tracker/TrackerView';
import { loadChats, seedDemoChats } from './lib/chats';
import { LANGS, useLang, type Lang } from './lib/i18n';
import { href, navigate, useRoute } from './lib/router';
import { stopSpeaking } from './lib/speech';

const READ_KEY = 'hospitalvoice_read_aloud';

export default function App() {
  const { lang, setLang, t } = useLang();
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const [chats, setChats] = useState(loadChats);
  const [readAloud, setReadAloud] = useState(() => {
    try { return localStorage.getItem(READ_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(READ_KEY, readAloud ? '1' : '0'); } catch { /* ignore */ }
    if (!readAloud) stopSpeaking();
  }, [readAloud]);
  useEffect(() => {
    const refresh = () => setChats(loadChats());
    window.addEventListener('hv-chats', refresh);
    window.addEventListener('storage', refresh);
    seedDemoChats();
    return () => { window.removeEventListener('hv-chats', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => {   // Ctrl/Cmd K opens chat search
    const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { stopSpeaking(); setMenuOpen(false); }, [route]);

  const langSwitch = (
    <SegmentedControl<Lang> label={t('language')} value={lang} onChange={setLang}
      options={LANGS.map((l) => ({ value: l.code, label: l.native, lang: l.code }))} />
  );
  const tab = route.name === 'planner' ? 'planner' : route.name === 'find' || route.name === 'chat' ? 'find' : null;

  return (
    <div className="min-h-full lg:flex">
      <Sidebar chats={chats} activeChatId={route.name === 'chat' ? route.id : null} trackerActive={route.name === 'tracker'}
               t={t} open={menuOpen} onClose={() => setMenuOpen(false)} footer={langSwitch}
               onSearch={() => { setMenuOpen(false); setSearchOpen(true); }}
               onNewChat={() => { setFlowKey((k) => k + 1); setMenuOpen(false); navigate(href.find); }} />
      {menuOpen && (
        <button type="button" aria-label={t('closeMenu')} onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-30 bg-ink/40 lg:hidden" />
      )}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar t={t} tab={tab} readAloud={readAloud} onToggleReadAloud={() => setReadAloud((v) => !v)}
                onOpenMenu={() => setMenuOpen(true)} languageSwitch={langSwitch} />
        <main className="flex-1">
          {route.name === 'find' && <FindFacility key={flowKey} lang={lang} t={t} readAloud={readAloud} />}
          {route.name === 'chat' && <ResultsView id={route.id} lang={lang} t={t} readAloud={readAloud} />}
          {route.name === 'tracker' && <TrackerView lang={lang} t={t} />}
          {route.name === 'planner' && <PlannerView t={t} />}
        </main>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} chats={chats} t={t} />
    </div>
  );
}
