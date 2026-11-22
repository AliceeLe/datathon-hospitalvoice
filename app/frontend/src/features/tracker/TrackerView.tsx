import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, MessageSquare, Plus, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { IconButton } from '../../components/ui/IconButton';
import { MicField } from '../../components/ui/MicField';
import { OptionGroup } from '../../components/ui/OptionGroup';
import { Section } from '../../components/ui/Section';
import { SortableTable, type Column } from '../../components/ui/SortableTable';
import { ref, type Appointment, type PatientCase, type TrackerData } from '../../lib/api';
import { loadChats } from '../../lib/chats';
import { cx } from '../../lib/cx';
import { speechLang, type Lang } from '../../lib/i18n';
import { href } from '../../lib/router';

type Props = { lang: Lang; t: (k: string, v?: Record<string, string | number>) => string };
const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN' };
const dayKey = (utc: string) => new Date(utc).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function TrackerView({ lang, t }: Props) {
  const loc = LOCALE[lang];
  const voice = speechLang(lang);
  const [data, setData] = useState<TrackerData | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'patient' | 'appt' | null>(null);

  const load = useCallback(() => {
    setError('');
    ref.tracker().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const byDay = useMemo(() => {
    const m: Record<string, Appointment[]> = {};
    for (const a of data?.appointments ?? []) (m[dayKey(a.scheduled_at)] ??= []).push(a);
    return m;
  }, [data]);
  const today = todayKey();
  const selDay = day ?? (byDay[today] ? today : Object.keys(byDay).sort().find((d) => d >= today) ?? today);
  const selMonth = month ?? selDay.slice(0, 7);
  const [y, m] = selMonth.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const dows = [...Array(7)].map((_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }));
  const shiftMonth = (d: number) => setMonth(new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7));
  const list = (byDay[selDay] ?? []).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const chats = loadChats();

  async function remind(a: Appointment) {
    try { await ref.remind(a.appointment_id); load(); } catch (e) { setError((e as Error).message); }
  }

  const fmt = (utc: string | null) => utc ? new Date(utc).toLocaleString(loc, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–';
  const cols: Column<PatientCase>[] = [
    { key: 'name', label: t('col_name'), value: (r) => r.patient_name },
    { key: 'age', label: t('col_age'), numeric: true, value: (r) => r.age_years },
    { key: 'phone', label: t('col_phone'), value: (r) => r.patient_phone,
      render: (r) => r.patient_phone ? <a className="font-mono text-ink underline-offset-4 hover:underline" href={`tel:${r.patient_phone.replace(/[^0-9+]/g, '')}`}>{r.patient_phone}</a> : '–' },
    { key: 'address', label: t('col_address'), value: (r) => r.address },
    { key: 'condition', label: t('col_condition'), value: (r) => r.condition },
    { key: 'program', label: t('col_program'), value: (r) => r.care_program },
    { key: 'secondary', label: t('col_secondary'), value: (r) => r.secondary_contacts },
    { key: 'hospital', label: t('col_hospital'), value: (r) => r.hospital_name },
    { key: 'next', label: t('col_next'), value: (r) => r.next_visit, render: (r) => <span className="whitespace-nowrap font-mono">{fmt(r.next_visit)}</span> },
    { key: 'chat', label: t('col_chat'), value: () => null, render: (r) => {
        const c = r.genie_conversation_id && chats.find((x) => x.conversationId === r.genie_conversation_id);
        return c ? <a className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline" href={href.chat(c.id)}>
          <MessageSquare className="size-4" aria-hidden="true" />{t('openChat')}</a> : <span className="text-ink-subtle">–</span>;
      } },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-8 lg:py-12">
      <div className="flex items-center gap-4">
        <h1 className="flex-1 text-2xl font-semibold lg:text-3xl">{t('tracker')}</h1>
        <IconButton label={t('tr_refresh')} icon={<RefreshCw className="size-5" aria-hidden="true" />} onClick={load} />
      </div>
      {error && <p role="alert" className="text-sm text-crit">{t('err_load')} {error}</p>}

      <Section title={t('tr_appts')} icon={<CalendarDays className="size-5" />}
               actions={<Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setDialog('appt')}>{t('tr_add_appt')}</Button>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <IconButton label={t('tr_prev_month')} icon={<ChevronLeft className="size-5" aria-hidden="true" />} onClick={() => shiftMonth(-1)} />
              <span className="font-semibold">{first.toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
              <IconButton label={t('tr_next_month')} icon={<ChevronRight className="size-5" aria-hidden="true" />} onClick={() => shiftMonth(1)} />
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {dows.map((d) => <span key={d} className="py-1 text-xs text-ink-subtle">{d}</span>)}
              {[...Array(lead)].map((_, i) => <span key={`e${i}`} />)}
              {[...Array(daysIn)].map((_, i) => {
                const key = `${selMonth}-${String(i + 1).padStart(2, '0')}`;
                const count = byDay[key]?.length ?? 0;
                return (
                  <button key={key} type="button" aria-pressed={key === selDay}
                          aria-label={`${i + 1}${count ? `, ${count}` : ''}`} onClick={() => setDay(key)}
                          className={cx('flex aspect-square min-h-10 flex-col items-center justify-center gap-0.5 rounded-md border text-sm',
                            key === selDay ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-sunken',
                            key === today && 'font-semibold text-brand')}>
                    <span className="font-mono">{i + 1}</span>
                    {count > 0 && <span className="rounded-sm bg-brand px-1 font-mono text-xs text-on-brand">{count}</span>}
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 font-semibold">{new Date(`${selDay}T00:00:00Z`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h3>
            {list.length === 0 && <p className="py-8 text-center text-sm text-ink-subtle">{t('tr_no_appts_day')}</p>}
            <ul className="flex flex-col">
              {list.map((a) => (
                <li key={a.appointment_id} className="flex items-start gap-4 border-t border-line py-4">
                  <span className="w-20 shrink-0 font-mono text-sm">{new Date(a.scheduled_at).toLocaleTimeString(loc, { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.patient_name ?? '–'}</div>
                    <div className="text-sm text-ink-muted">{a.condition ?? '–'}</div>
                    <div className="text-sm text-ink-muted">{a.hospital_name ?? '–'}</div>
                  </div>
                  {a.reminder_call_done_at
                    ? <Badge tone="ok" icon={<Check className="size-3" />}>{t('tr_sent')}</Badge>
                    : <Button icon={<Bell className="size-4" aria-hidden="true" />} disabled={!a.consent_to_reminders}
                              title={a.consent_to_reminders ? undefined : t('tr_no_consent')} onClick={() => remind(a)}>{t('tr_remind')}</Button>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section title={t('tr_patients')} icon={<Users className="size-5" />}
               actions={<Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setDialog('patient')}>{t('tr_add_patient')}</Button>}>
        {data && data.cases.length === 0 && <p className="text-sm text-ink-subtle">{t('tr_no_patients')}</p>}
        {data && data.cases.length > 0 && (
          <SortableTable caption={t('tr_patients')} columns={cols} rows={data.cases} rowKey={(r) => r.case_id} />
        )}
      </Section>

      <AddPatientDialog open={dialog === 'patient'} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} t={t} voice={voice} />
      <AddAppointmentDialog open={dialog === 'appt'} onClose={() => setDialog(null)} onSaved={(d) => { setDialog(null); setDay(d); setMonth(d.slice(0, 7)); load(); }}
                            t={t} voice={voice} cases={data?.cases ?? []} defaultDay={selDay} />
    </div>
  );
}

type DProps = { open: boolean; onClose: () => void; t: Props['t']; voice: string };

function AddPatientDialog({ open, onClose, onSaved, t, voice }: DProps & { onSaved: () => void }) {
  const [f, setF] = useState({ name: '', age: '', phone: '', address: '', condition: '', program: '', secondary: '', hospital: '' });
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name.trim() || !f.phone.trim()) { setErr(t('ref_err_name_phone')); return; }
    setBusy(true); setErr('');
    try {
      await ref.addPatient({ name: f.name, age_years: f.age, phone: f.phone, address: f.address, condition: f.condition,
        care_program: f.program, secondary_contacts: f.secondary, hospital: f.hospital, consent: consent === 'yes' });
      setF({ name: '', age: '', phone: '', address: '', condition: '', program: '', secondary: '', hospital: '' }); setConsent(null);
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const field = (k: keyof typeof f, label: string, extra: Record<string, string> = {}) =>
    <MicField label={label} value={f[k]} onValue={set(k)} speechLang={voice} micLabel={t('micAnswer')} {...extra} />;
  return (
    <Dialog open={open} title={t('tr_add_patient')} closeLabel={t('close')} onClose={onClose}
            footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={busy} onClick={save}>{t('save')}</Button></>}>
      <Badge tone="warn">{t('demoOnly')}</Badge>
      {field('name', `${t('ref_name')} *`)}{field('phone', `${t('ref_phone')} *`, { type: 'tel' })}{field('age', t('ref_age'), { inputMode: 'numeric' })}
      {field('address', t('col_address'))}{field('condition', t('ref_condition'))}{field('program', t('col_program'))}
      {field('secondary', t('col_secondary'))}{field('hospital', t('col_hospital'))}
      <span className="text-sm font-medium text-ink-muted">{t('ref_consent')}</span>
      <OptionGroup label={t('ref_consent')} value={consent} onChange={setConsent} options={[{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }]} />
      {err && <p role="alert" className="text-sm text-crit">{err}</p>}
    </Dialog>
  );
}

function AddAppointmentDialog({ open, onClose, onSaved, t, voice, cases, defaultDay }: DProps & { onSaved: (day: string) => void; cases: PatientCase[]; defaultDay: string }) {
  const [caseId, setCaseId] = useState('');
  const [when, setWhen] = useState('');
  const [hospital, setHospital] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { const c = cases[0]; setCaseId(c?.case_id ?? ''); setHospital(c?.hospital_name ?? ''); setWhen(`${defaultDay}T10:00`); setErr(''); } }, [open, cases, defaultDay]);
  async function save() {
    if (!caseId || !when || !hospital.trim()) { setErr(t('tr_err_date_hosp')); return; }
    setBusy(true); setErr('');
    try { await ref.addAppointment({ case_id: caseId, appointment_at: when, hospital }); onSaved(when.slice(0, 10)); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} title={t('tr_add_appt')} closeLabel={t('close')} onClose={onClose}
            footer={<><Button onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={busy} onClick={save}>{t('save')}</Button></>}>
      <label className="flex flex-col gap-2 text-sm font-medium text-ink-muted">{`${t('th_patient')} *`}
        <select value={caseId} onChange={(e) => { setCaseId(e.target.value); setHospital(cases.find((c) => c.case_id === e.target.value)?.hospital_name ?? ''); }}
                className="min-h-12 rounded-md border border-line-strong bg-surface px-4 text-base text-ink">
          {cases.map((c) => <option key={c.case_id} value={c.case_id}>{c.patient_name}{c.age_years ? ` · ${c.age_years} ${t('yrs')}` : ''}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-ink-muted">{`${t('ref_date')} *`}
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
               className="min-h-12 rounded-md border border-line-strong bg-surface px-4 font-mono text-base text-ink" />
      </label>
      <MicField label={`${t('col_hospital')} *`} value={hospital} onValue={setHospital} speechLang={voice} micLabel={t('micAnswer')} />
      {err && <p role="alert" className="text-sm text-crit">{err}</p>}
    </Dialog>
  );
}
