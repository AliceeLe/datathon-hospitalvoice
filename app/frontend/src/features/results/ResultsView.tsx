import { ArrowUp, Clock, Mic, Phone, Siren, SquarePen } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { IconButton } from '../../components/ui/IconButton';
import { SpeakButton } from '../../components/ui/SpeakButton';
import { TextField } from '../../components/ui/TextField';
import { askFollowUp, isInsufficient, type AskResult, type Hospital } from '../../lib/api';
import { getChat, saveChat, type ChatMessage, type StoredChat } from '../../lib/chats';
import { speechLang, type Lang } from '../../lib/i18n';
import { href, navigate } from '../../lib/router';
import { canListen, listenOnce, speak } from '../../lib/speech';
import { ContactFlow } from './ContactFlow';
import { HospitalCard } from './HospitalCard';

type Props = { id: string; lang: Lang; t: (k: string, v?: Record<string, string | number>) => string; readAloud: boolean };

export function ResultsView({ id, lang, t, readAloud }: Props) {
  const [chat, setChat] = useState<StoredChat | undefined>(() => getChat(id));
  const [active, setActive] = useState<{ msg: number; idx: number } | null>(null);
  const [hospitalOverride, setHospitalOverride] = useState<Hospital | null>(null);
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const voice = speechLang(lang);

  useEffect(() => { setChat(getChat(id)); setActive(null); setHospitalOverride(null); }, [id]);
  const first = chat?.messages[0]?.data;
  useEffect(() => {   // read the first answer aloud if the coordinator turned read-aloud on
    if (readAloud && first?.answer) speak(first.answer, voice);
  }, [readAloud, first, voice]);

  if (!chat) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-4 px-4 py-12 lg:px-8">
        <h1 className="text-2xl font-semibold">{t('chatMissing')}</h1>
        <Button variant="primary" icon={<SquarePen className="size-4" aria-hidden="true" />} onClick={() => navigate(href.find)}>{t('newChat')}</Button>
      </div>
    );
  }
  const c = chat;
  const emergency = c.emergency !== false;
  const allHospitals = c.messages.flatMap((m) => m.data?.cards?.hospitals ?? []);

  async function ask(e?: FormEvent, text?: string) {
    e?.preventDefault();
    const question = (text ?? q).trim();
    if (!question || asking) return;
    setAsking(true);
    let data: AskResult;
    try { data = await askFollowUp(question, c.conversationId, emergency, c.caseCtx?.hospitals ?? [], lang); }
    catch (err) { data = { error: (err as Error).message }; }
    const msg: ChatMessage = { kind: data.cards?.hospitals?.length ? 'cards' : 'answer', q: question, data, isFirst: false };
    const updated: StoredChat = { ...c, conversationId: data.conversation_id ?? c.conversationId, updated: Date.now(),
      messages: [...c.messages, msg],
      caseCtx: { ...c.caseCtx, hospitals: [...new Set([...(c.caseCtx?.hospitals ?? []), ...(data.cards?.hospitals ?? []).map((h) => h.name)])] } };
    saveChat(updated); setChat(updated); setQ(''); setAsking(false);
    if (readAloud && data.answer) speak(data.answer, voice);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={emergency ? 'crit' : 'ok'} icon={emergency ? <Siren className="size-3" /> : <Clock className="size-3" />}>
          {t(emergency ? 'urgentBadge' : 'notUrgentBadge')}
        </Badge>
        <span className="text-sm text-ink-muted">{c.title}</span>
      </div>
      {emergency && (
        <a href="tel:108" className="flex min-h-12 items-center gap-4 rounded-lg border border-crit-line bg-crit-soft px-4 text-base font-semibold text-crit">
          <Phone className="size-5" aria-hidden="true" />{t('ambulance')}
        </a>
      )}

      {c.messages.map((m, mi) => {
        const hospitals = m.data?.cards?.hospitals ?? [];
        const weak = isInsufficient(m.data ?? {});
        const heading = m.isFirst ? (hospitals.length === 1 ? t('resultsOne') : hospitals.length ? t('results', { n: hospitals.length }) : t('noHospitals')) : m.q;
        return (
          <section key={mi} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <h1 className={m.isFirst ? 'text-2xl font-semibold lg:text-3xl' : 'text-lg font-semibold'}>{heading}</h1>
              {m.data?.answer && <SpeakButton text={m.data.answer} lang={voice} label={t('speak')} />}
            </div>
            {hospitals.length > 0
              ? hospitals.map((h, i) => {
                  const isActive = active?.msg === mi && active.idx === i;
                  const shown = isActive && hospitalOverride ? hospitalOverride : h;
                  return (
                    <HospitalCard key={`${mi}-${i}`} h={shown} lang={lang} t={t} compact={!m.isFirst}
                      canContact={!active} onContact={() => { setHospitalOverride(null); setActive({ msg: mi, idx: i }); }}
                      contact={isActive ? (
                        <ContactFlow hospital={shown} candidates={allHospitals} need={c.caseCtx?.need ?? ''} address={c.caseCtx?.address ?? ''}
                                     emergency={emergency} conversationId={c.conversationId} t={t} voice={voice}
                                     onClose={() => { setActive(null); setHospitalOverride(null); }} onHospitalChange={setHospitalOverride} />
                      ) : undefined} />
                  );
                })
              : <Card className="p-4 text-base">{weak ? t(m.isFirst ? 'nothing' : 'insufficient') : m.data?.answer}</Card>}
          </section>
        );
      })}

      <form onSubmit={ask} className="sticky bottom-4 flex items-center gap-2 rounded-lg border border-line bg-surface p-2">
        <IconButton label={t('micAnswer')} disabled={!canListen() || listening || asking} aria-busy={listening || undefined}
                    icon={<Mic className="size-5" aria-hidden="true" />}
                    onClick={async () => { setListening(true); try { const text = await listenOnce(voice); if (text) await ask(undefined, text); } finally { setListening(false); } }} />
        <TextField label={t('askPh')} value={q} onChange={(e) => setQ(e.target.value)} className="border-0" disabled={asking} />
        <IconButton type="submit" tone="brand" label={t('ask')} disabled={!q.trim() || asking}
                    icon={<ArrowUp className="size-5" aria-hidden="true" />} />
      </form>
      {asking && <p role="status" className="text-sm text-ink-muted">{t('thinking')}</p>}
    </div>
  );
}
