import { ArrowLeft, ArrowRight, Clock, LoaderCircle, LocateFixed, MapPin, Mic, Siren, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ChoiceTile } from '../../components/ui/ChoiceTile';
import { Chip } from '../../components/ui/Chip';
import { IconButton } from '../../components/ui/IconButton';
import { SpeakButton } from '../../components/ui/SpeakButton';
import { StepProgress } from '../../components/ui/StepProgress';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { askHospitals } from '../../lib/api';
import { saveChat } from '../../lib/chats';
import { href, navigate } from '../../lib/router';
import { speechLang, type Key, type Lang } from '../../lib/i18n';
import { canListen, listenOnce, speak } from '../../lib/speech';
import { NEEDS } from './needs';

type Answer = { label: string; value: string; icon: LucideIcon };
type Props = { lang: Lang; t: (k: Key, v?: Record<string, string | number>) => string; readAloud: boolean };

const QUESTIONS: Record<1 | 2 | 3, Key> = { 1: 'qNeed', 2: 'qWhere', 3: 'qUrgent' };

export function FindFacility({ lang, t, readAloud }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [need, setNeed] = useState<Answer | null>(null);
  const [place, setPlace] = useState<Answer | null>(null);
  const [typed, setTyped] = useState('');
  const [listening, setListening] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState<boolean | null>(null);
  const voice = speechLang(lang);
  const question = t(QUESTIONS[step]);

  useEffect(() => { if (readAloud) speak(question, voice); }, [step, readAloud, question, voice]);

  const go = (s: 1 | 2 | 3) => { setStatus(''); setFailed(null); setStep(s); };

  async function listenFor(onText: (text: string) => void) {
    if (!canListen()) { setStatus(t('noSpeech')); return; }
    setStatus(''); setListening(true);
    try { const text = await listenOnce(voice); if (text) onText(text); }
    catch { setStatus(t('noSpeech')); }
    finally { setListening(false); }
  }

  function chooseNeed(a: Answer) { setNeed(a); go(2); }
  function choosePlace(a: Answer) { setPlace(a); go(3); }

  function useMyLocation() {
    if (!('geolocation' in navigator)) { setStatus(t('noLocation')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); choosePlace({ label: t('myLocation'), icon: LocateFixed,
        value: `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}` }); },
      () => { setLocating(false); setStatus(t('noLocation')); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const v = typed.trim();
    if (v) choosePlace({ label: v, value: v, icon: MapPin });
  }

  async function finish(emergency: boolean) {
    if (!need || !place) return;
    setSearching(true); setFailed(null);
    try {
      const data = await askHospitals(need.value, place.value, emergency, lang);
      const hospitals = (data.cards?.hospitals ?? []).map((h) => h.name);
      const now = Date.now();
      const id = `c${now}${Math.random().toString(36).slice(2, 7)}`;
      saveChat({
        id, title: `${need.label} · ${place.label}`.slice(0, 90), created: now, updated: now,
        conversationId: data.conversation_id ?? null, emergency,
        caseCtx: { need: need.value, address: place.value, freq: '', emergency, hospitals },
        messages: [{ kind: hospitals.length ? 'cards' : 'answer', q: `${need.label} · ${place.label}`, data, isFirst: true }],
      });
      navigate(href.chat(id));   // results, Contact and follow-ups
    } catch {
      setSearching(false); setFailed(true);
    }
  }

  const iconCls = 'size-6';
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 lg:px-8 lg:py-12">
      <div className="flex items-center gap-4">
        {step > 1 && (
          <IconButton shape="square" label={t('back')} icon={<ArrowLeft className="size-5" aria-hidden="true" />}
                      onClick={() => go((step - 1) as 1 | 2)} disabled={searching} />
        )}
        <StepProgress step={step} label={t('progress', { n: step })} />
      </div>

      {(need || (place && step === 3)) && step > 1 && (
        <div className="flex flex-wrap gap-2">
          {need && <Chip icon={<need.icon className="size-5" />} label={need.label} actionLabel={t('change')} onClick={() => go(1)} />}
          {place && step === 3 && <Chip icon={<place.icon className="size-5" />} label={place.label} actionLabel={t('change')} onClick={() => go(2)} />}
        </div>
      )}

      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">{question}</h1>
        <SpeakButton text={question} lang={voice} label={t('speak')} />
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {NEEDS.map((n) => (
              <ChoiceTile key={n.key} icon={<n.icon className={iconCls} />} label={t(n.key)}
                          onSelect={() => chooseNeed({ label: t(n.key), value: n.query, icon: n.icon })} />
            ))}
          </div>
          <ChoiceTile layout="row" tone="brand" busy={listening} icon={<Mic className={iconCls} />}
                      label={listening ? t('listening') : t('sayNeed')}
                      onSelect={() => listenFor((text) => chooseNeed({ label: text, value: text, icon: Mic }))} />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <ChoiceTile layout="row" tone="brand" busy={locating} icon={<LocateFixed className={iconCls} />}
                      label={t('useLocation')} onSelect={useMyLocation} />
          <ChoiceTile layout="row" busy={listening} icon={<Mic className={iconCls} />}
                      label={listening ? t('listening') : t('sayPlace')}
                      onSelect={() => listenFor((text) => choosePlace({ label: text, value: text, icon: MapPin }))} />
          <form onSubmit={submitTyped} className="flex items-center gap-4">
            <TextField label={t('typePlace')} icon={<MapPin className="size-5" />} value={typed}
                       onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <IconButton type="submit" shape="square" tone="brand" label={t('go')} disabled={!typed.trim()}
                        icon={<ArrowRight className="size-5" aria-hidden="true" />} className="size-14" />
          </form>
        </div>
      )}

      {step === 3 && !searching && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ChoiceTile layout="hero" tone="crit" icon={<Siren className="size-8" />} label={t('emergency')} onSelect={() => finish(true)} />
          <ChoiceTile layout="hero" tone="ok" icon={<Clock className="size-8" />} label={t('notUrgent')} onSelect={() => finish(false)} />
        </div>
      )}

      {searching && (
        <div role="status" className="flex min-h-56 items-center justify-center gap-4 rounded-lg border border-line bg-surface text-lg font-medium">
          <LoaderCircle className="size-6 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
          {t('finding')}
        </div>
      )}

      <div role="status" aria-live="polite" className="min-h-6 text-base text-ink-muted">
        {status}
        {failed && (
          <span className="flex items-center gap-4">
            {t('failed')}
            <Button variant="outline" onClick={() => setFailed(null)}>{t('tryAgain')}</Button>
          </span>
        )}
      </div>
    </div>
  );
}
