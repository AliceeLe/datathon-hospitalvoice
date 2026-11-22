import { Ban, BedDouble, CalendarCheck, CircleHelp, ClipboardList, IndianRupee, MessageCircle, Navigation, Phone, PhoneOff,
         RotateCcw, ScanLine, SquarePen, Stethoscope, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ChoiceTile } from '../../components/ui/ChoiceTile';
import { MicField } from '../../components/ui/MicField';
import { OptionGroup } from '../../components/ui/OptionGroup';
import { ref, type Hospital } from '../../lib/api';
import { href, navigate } from '../../lib/router';

type Screen = 'call' | 'refused' | 'next' | 'noanswer' | 'when' | 'bring' | 'patient' | 'done' | 'nomore';
type Props = {
  hospital: Hospital; candidates: Hospital[]; need: string; address: string; emergency: boolean;
  conversationId: string | null; t: (k: string, v?: Record<string, string | number>) => string; voice: string;
  onClose: () => void; onHospitalChange: (h: Hospital) => void;
};

const REASONS = [
  { key: 'no_machine', icon: ScanLine }, { key: 'no_doctor', icon: Stethoscope }, { key: 'no_bed', icon: BedDouble },
  { key: 'too_expensive', icon: IndianRupee }, { key: 'other', icon: CircleHelp },
] as const;
const DAYS = ['today', 'tomorrow', 'dayAfter'] as const;
const TIMES = { morning: '09:00', afternoon: '14:00', evening: '18:00' } as const;
const BRING = ['chip_aadhaar', 'chip_reports', 'chip_letter', 'chip_scheme'] as const;

function ymd(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const guessService = (need: string) => (/dialys|kidney|renal/i.test(need) ? 'dialysis' : 'mri');

/** Contact steps inside a hospital card. Every answer is one tap; typing is only for patient details. */
export function ContactFlow({ hospital, candidates, need, address, emergency, conversationId, t, voice, onClose, onHospitalChange }: Props) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('call');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [next, setNext] = useState<Hospital | null>(null);
  const [day, setDay] = useState<(typeof DAYS)[number] | null>(null);
  const [time, setTime] = useState<keyof typeof TIMES | null>(null);
  const [exact, setExact] = useState('');
  const [bring, setBring] = useState<string[]>([]);
  const [bringExtra, setBringExtra] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null);
  const [summary, setSummary] = useState<{ when: string; bring: string } | null>(null);

  useEffect(() => {   // open a draft referral case as soon as the coordinator contacts a hospital
    let live = true;
    ref.start({ hospital, candidates, service_code: guessService(need), need, emergency, address, conversation_id: conversationId })
      .then((r) => live && setCaseId(r.case_id)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<void>) {
    if (!caseId) return;
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(t('ref_err_save', { msg: (e as Error).message })); } finally { setBusy(false); }
  }

  const whenValue = exact || (day && time ? `${ymd(DAYS.indexOf(day))}T${TIMES[time]}` : '');
  const bringValue = [...bring.map((k) => t(k)), bringExtra.trim()].filter(Boolean).join(', ');
  const icon = (I: typeof Ban) => <I className="size-6" />;
  const title = (s: string) => <h4 className="text-lg font-semibold">{s}</h4>;
  let body: ReactNode = null;

  if (screen === 'call') body = (<>
    <div className="flex items-center gap-4">
      <Phone className="size-5 text-ink-muted" aria-hidden="true" />
      <span className={hospital.phone ? 'font-mono text-xl font-medium' : 'text-base text-ink-subtle'}>{hospital.phone ?? t('ref_no_number')}</span>
    </div>
    {title(t('callResult'))}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <ChoiceTile icon={icon(CalendarCheck)} label={t('ref_gave_date')} onSelect={() => setScreen('when')} />
      <ChoiceTile icon={icon(Ban)} label={t('ref_turned_away')} onSelect={() => setScreen('refused')} />
      <ChoiceTile icon={icon(PhoneOff)} label={t('ref_no_answer')} busy={busy}
                  onSelect={() => run(async () => { await ref.call(caseId!, { result: 'no_answer' }); setScreen('noanswer'); })} />
    </div>
  </>);

  if (screen === 'refused') body = (<>
    {title(t('ref_why_no'))}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {REASONS.map((r) => (
        <ChoiceTile key={r.key} icon={icon(r.icon)} label={t(`reason_${r.key}`)} busy={busy}
                    onSelect={() => run(async () => {
                      const res = await ref.call(caseId!, { result: 'turned_away', refusal_reason: r.key });
                      if (res.next) { setNext(res.next); setScreen('next'); } else setScreen('nomore');
                    })} />
      ))}
    </div>
  </>);

  if (screen === 'next' && next) body = (<>
    {title(next.name)}
    {next.km != null && <span className="font-mono text-sm text-ink-muted">{next.km} km</span>}
    <Button variant="primary" size="lg" icon={<Phone className="size-5" aria-hidden="true" />} disabled={busy}
            onClick={() => run(async () => { await ref.switchHospital(caseId!, next); onHospitalChange(next); setScreen('call'); })}>
      {t('ref_contact_this')}
    </Button>
  </>);

  if (screen === 'nomore') body = (<>{title(t('ref_no_other'))}<Button onClick={onClose}>{t('ref_back_list')}</Button></>);

  if (screen === 'noanswer') {
    const wa = String(hospital.phone_raw ?? '').replace(/\D/g, '');
    const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hospital.name} ${hospital.address ?? ''}`)}`;
    const tile = 'flex min-h-20 items-center gap-4 rounded-lg border border-line-strong bg-surface px-4 text-lg font-semibold hover:border-brand-line';
    body = (<>
      {title(t('ref_no_pickup'))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChoiceTile layout="row" icon={icon(RotateCcw)} label={t('ref_try_again')} onSelect={() => setScreen('call')} />
        {wa && <a className={tile} target="_blank" rel="noopener" href={`https://wa.me/${wa}`}>
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-sunken"><MessageCircle className="size-6" /></span>{t('ref_whatsapp')}</a>}
        <a className={tile} target="_blank" rel="noopener" href={map}>
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-sunken"><Navigation className="size-6" /></span>{t('ref_in_person')}</a>
      </div>
    </>);
  }

  if (screen === 'when') body = (<>
    {title(t('whenTitle'))}
    <OptionGroup label={t('whenTitle')} value={day} onChange={(v) => { setDay(v); setExact(''); }}
                 options={DAYS.map((d) => ({ value: d, label: t(d) }))} />
    <OptionGroup label={t('whenTitle')} value={time} onChange={(v) => { setTime(v); setExact(''); }}
                 options={(Object.keys(TIMES) as (keyof typeof TIMES)[]).map((k) => ({ value: k, label: `${t(k)} ${TIMES[k]}` }))} />
    <label className="flex flex-col gap-2 text-sm font-medium text-ink-muted">{t('exactTime')}
      <input type="datetime-local" value={exact} onChange={(e) => setExact(e.target.value)}
             className="min-h-12 rounded-md border border-line-strong bg-surface px-4 font-mono text-base text-ink" />
    </label>
    <Button variant="primary" size="lg" disabled={!whenValue} onClick={() => setScreen('bring')}>{t('continue')}</Button>
  </>);

  if (screen === 'bring') body = (<>
    {title(t('bringTitle'))}
    <OptionGroup multiple label={t('bringTitle')} value={bring} onChange={setBring} options={BRING.map((k) => ({ value: k, label: t(k) }))} />
    <MicField label={t('ref_bring_ph')} value={bringExtra} onValue={setBringExtra} speechLang={voice} micLabel={t('micAnswer')} />
    <Button variant="primary" size="lg" disabled={!bringValue || busy}
            onClick={() => run(async () => {
              await ref.call(caseId!, { result: 'accepted_slot', service_code: guessService(need), appointment_at: whenValue, what_to_bring: bringValue });
              setScreen('patient');
            })}>{t('continue')}</Button>
  </>);

  if (screen === 'patient') body = (<>
    <div className="flex items-center gap-2">{title(t('patientTitle'))}<Badge tone="warn">{t('demoOnly')}</Badge></div>
    <MicField label={`${t('ref_name')} *`} value={name} onValue={setName} speechLang={voice} micLabel={t('micAnswer')} icon={<UserRound className="size-5" />} />
    <MicField label={`${t('ref_phone')} *`} value={phone} onValue={setPhone} speechLang={voice} micLabel={t('micAnswer')} type="tel" icon={<Phone className="size-5" />} />
    <MicField label={t('ref_age')} value={age} onValue={(v) => setAge(v.replace(/\D/g, ''))} speechLang={voice} micLabel={t('micAnswer')} inputMode="numeric" />
    <span className="text-sm font-medium text-ink-muted">{t('ref_consent')}</span>
    <OptionGroup label={t('ref_consent')} value={consent} onChange={setConsent} options={[{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }]} />
    <Button variant="primary" size="lg" disabled={!name.trim() || !phone.trim() || busy}
            onClick={() => run(async () => {
              const d = await ref.confirm(caseId!, { name_or_code: name.trim(), phone: phone.trim(), age_years: age, condition: need, consent: consent === 'yes' });
              const when = d.appointments?.[0]?.scheduled_at;
              setSummary({ when: when ? new Date(when).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '', bring: bringValue });
              setScreen('done');
            })}>{t('ref_confirm_sent')}</Button>
  </>);

  if (screen === 'done' && summary) body = (<>
    <div className="flex items-center gap-2"><Badge tone="ok" icon={<CalendarCheck className="size-3" />}>{t('done')}</Badge></div>
    {title(t('ref_referred', { name, hospital: hospital.name }))}
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-ink-muted">{t('whenTitle')}</dt><dd className="font-mono">{summary.when}</dd>
      <dt className="text-ink-muted">{t('bringTitle')}</dt><dd>{summary.bring}</dd>
    </dl>
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" icon={<ClipboardList className="size-4" aria-hidden="true" />} onClick={() => navigate(href.tracker)}>{t('ref_open_tracker')}</Button>
      <Button icon={<SquarePen className="size-4" aria-hidden="true" />} onClick={() => navigate(href.find)}>{t('newChat')}</Button>
    </div>
  </>);

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      {body}
      <div role="status" aria-live="polite" className="min-h-6 text-sm text-crit">{error}</div>
      {screen !== 'done' && <button type="button" onClick={onClose} className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline">{t('ref_back')}</button>}
    </div>
  );
}
