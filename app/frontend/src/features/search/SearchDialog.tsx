import { MessageSquare, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/TextField';
import type { StoredChat } from '../../lib/chats';
import { href, navigate } from '../../lib/router';

function chatText(c: StoredChat): string {
  const parts: string[] = [c.title];
  for (const m of c.messages ?? []) {
    parts.push(m.q ?? '', m.data?.answer ?? '');
    for (const h of m.data?.cards?.hospitals ?? []) parts.push(h.name, h.address ?? '', (h.bullets ?? []).join(' '));
  }
  return parts.join(' \n ');
}

/** Ctrl K search over saved chats; picking one opens it. */
export function SearchDialog({ open, onClose, chats, t }: { open: boolean; onClose: () => void; chats: StoredChat[]; t: (k: string) => string }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return chats.filter((c) => { const s = chatText(c).toLowerCase(); return terms.every((w) => s.includes(w)); }).slice(0, 30);
  }, [q, chats]);
  return (
    <Dialog open={open} title={t('searchChats')} closeLabel={t('close')} onClose={() => { setQ(''); onClose(); }}>
      <TextField label={t('search_ph')} icon={<Search className="size-5" />} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="flex flex-col gap-2" aria-live="polite">
        {hits.length === 0 && <li className="py-4 text-center text-sm text-ink-subtle">{t(q ? 'search_none' : 'search_empty')}</li>}
        {hits.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => { onClose(); setQ(''); navigate(href.chat(c.id)); }}
                    className="flex min-h-12 w-full items-center gap-4 rounded-md border border-line px-4 py-2 text-left hover:border-brand-line">
              <MessageSquare className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block font-mono text-xs text-ink-subtle">{new Date(c.updated || c.created).toLocaleString()}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
