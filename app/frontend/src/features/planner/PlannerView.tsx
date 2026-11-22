import { AlertTriangle, ArrowDown, ArrowUp, Building2, ChevronRight, HeartPulse, MapPinned, Route, Table2, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Meter } from '../../components/ui/Meter';
import { Section } from '../../components/ui/Section';
import { SortableTable, type Column } from '../../components/ui/SortableTable';
import { dashboard, n, type Row, type StateContext } from '../../lib/api';
import { num } from '../../lib/format';
import { IndiaMap } from './IndiaMap';

type T = (k: string, v?: Record<string, string | number>) => string;
type Props = { t: T };

// Service distances (km to the nearest facility offering it) and the gap threshold used in "Needs attention".
const SERVICES = [
  { key: 'emergency_c_section', label: 'svc_csection', far: 50 }, { key: 'trauma_emergency', label: 'svc_trauma', far: 50 },
  { key: 'icu', label: 'svc_icu', far: 50 }, { key: 'blood_bank', label: 'svc_blood', far: 50 },
  { key: 'nicu', label: 'svc_nicu', far: 60 }, { key: 'dialysis', label: 'svc_dialysis', far: 60 },
  { key: 'ct_scan', label: 'svc_ct', far: 80 }, { key: 'mri', label: 'svc_mri', far: 100 },
  { key: 'cardiac_surgery', label: 'svc_cardiac', far: 150 }, { key: 'burn_care', label: 'svc_burns', far: 150 },
] as const;
// NFHS-5 indicators: higher is better unless `lower`.
const NFHS = [
  { key: 'institutional_birth_5y_pct', label: 'nf_inst_births' },
  { key: 'mothers_who_had_at_least_4_anc_visits_lb5y_pct', label: 'nf_anc' },
  { key: 'child_12_23m_fully_vaccinated_based_on_information_from_eit_pct', label: 'nf_vaccination' },
  { key: 'hh_member_covered_health_insurance_pct', label: 'nf_insurance' },
  { key: 'child_u5_who_are_stunted_height_for_age_18_pct', label: 'nf_stunting', lower: true },
  { key: 'all_w15_49_who_are_anaemic_pct', label: 'nf_anaemia', lower: true },
] as const;

type Gap = { tone: 'crit' | 'warn'; place: string; text: string; sort: number; missing?: boolean };

/** Districts most in need: services far away or not recorded at all. */
function findGaps(rows: Row[], t: T): Gap[] {
  const out: Gap[] = [];
  for (const r of rows) {
    const place = String(r.district ?? '');
    for (const s of SERVICES) {
      const km = n(r[`km_nearest_${s.key}`]);
      if (km !== null && km >= s.far) out.push({ tone: km >= s.far * 2 ? 'crit' : 'warn', place, sort: km / s.far,
        text: t('kmTo', { km: num(Math.round(km)), service: t(s.label) }) });
    }
    if (n(r.n_hospitals) === 0) out.push({ tone: 'warn', place, sort: 1.5, text: t('zeroHospitals'), missing: true });
  }
  return out.sort((a, b) => b.sort - a.sort).slice(0, 8);
}

function Stat({ label, value, unit, note, badge }: { label: string; value: string; unit?: string; note?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-2 text-sm text-ink-muted">{label}{badge}</dt>
      <dd className="flex items-baseline gap-1"><span className="font-mono text-2xl font-medium">{value}</span>
        {unit && <span className="text-sm text-ink-muted">{unit}</span>}</dd>
      {note && <dd className="text-xs text-ink-subtle">{note}</dd>}
    </div>
  );
}

/** Value vs India, colour by direction (all vital rates here: lower is better). Arrow + word, never colour alone. */
function VsIndia({ v, india, lower = true, t }: { v: number | null; india: number | null; lower?: boolean; t: T }) {
  if (v === null || india === null) return null;
  const good = lower ? v < india : v > india;
  const same = v === india;
  return (
    <span className={same ? 'text-ink-muted' : good ? 'text-ok' : 'text-crit'}>
      {!same && (v < india ? <ArrowDown className="mr-1 inline size-3" aria-hidden="true" /> : <ArrowUp className="mr-1 inline size-3" aria-hidden="true" />)}
      {t('vsIndia', { v: num(india, india % 1 ? 1 : 0) })}{!same && ` · ${t(good ? 'better' : 'worse')}`}
    </span>
  );
}

export function PlannerView({ t }: Props) {
  const [states, setStates] = useState<string[]>([]);
  const [state, setState] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [agg, setAgg] = useState<(Row & { districts: Row[] }) | null>(null);
  const [drow, setDrow] = useState<Row | null>(null);
  const [ctx, setCtx] = useState<StateContext | null>(null);
  const [facilities, setFacilities] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { dashboard.states().then((d) => setStates(d.states)).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    setAgg(null); setCtx(null); setDistrict(null); setDrow(null); setFacilities(null);
    if (!state) return;
    setError('');
    dashboard.state(state).then(setAgg).catch((e: Error) => setError(e.message));
    dashboard.context(state).then(setCtx).catch(() => setCtx(null));
  }, [state]);
  useEffect(() => {
    setDrow(null); setFacilities(null);
    if (!state) return;
    if (district) dashboard.district(state, district).then(setDrow).catch((e: Error) => setError(e.message));
    dashboard.facilities(state, district).then((d) => setFacilities(d.facilities)).catch(() => setFacilities([]));
  }, [state, district]);

  const districtNames = useMemo(() => (agg?.districts ?? []).map((d) => String(d.district)), [agg]);
  const view: Row | null = district ? drow : agg;
  const gaps = useMemo(() => findGaps(district ? (drow ? [drow] : []) : agg?.districts ?? [], t), [agg, drow, district, t]);
  const scope = district ?? state ?? '';
  const isState = !district;

  const distCols: Column<Row>[] = [
    { key: 'district', label: t('pl_district'), value: (r) => String(r.district ?? '') },
    { key: 'fac', label: t('pl_total_fac'), numeric: true, value: (r) => n(r.n_facilities), render: (r) => num(n(r.n_facilities)) },
    { key: 'hosp', label: t('hospitals'), numeric: true, value: (r) => n(r.n_hospitals), render: (r) => num(n(r.n_hospitals)) },
    { key: 'beds', label: t('pl_beds'), numeric: true, value: (r) => n(r.total_beds_listed), render: (r) => num(n(r.total_beds_listed)) },
    { key: 'icu', label: t('svc_icu'), numeric: true, value: (r) => n(r.n_icu), render: (r) => num(n(r.n_icu)) },
    { key: 'blood', label: t('pl_blood_banks'), numeric: true, value: (r) => n(r.n_blood_bank), render: (r) => num(n(r.n_blood_bank)) },
    { key: 'cs', label: `${t('svc_csection')} (km)`, numeric: true, value: (r) => n(r.km_nearest_emergency_c_section), render: (r) => km(r.km_nearest_emergency_c_section) },
    { key: 'dia', label: `${t('svc_dialysis')} (km)`, numeric: true, value: (r) => n(r.km_nearest_dialysis), render: (r) => km(r.km_nearest_dialysis) },
  ];
  const facCols: Column<Row>[] = [
    { key: 'name', label: t('col_name'), value: (r) => String(r.name ?? '') },
    ...(isState ? [{ key: 'district', label: t('pl_district'), value: (r: Row) => String(r.district ?? '') }] : []),
    { key: 'type', label: t('pl_type'), value: (r) => String(r.facility_type ?? '–') },
    { key: 'beds', label: t('pl_beds_col'), numeric: true, value: (r) => n(r.beds), render: (r) => num(n(r.beds)) },
    { key: 'doctors', label: t('pl_doctors_col'), numeric: true, value: (r) => n(r.doctors), render: (r) => num(n(r.doctors)) },
    { key: 'phone', label: t('col_phone'), value: (r) => (r.official_phone ? String(r.official_phone) : null),
      render: (r) => r.official_phone ? <span className="font-mono">{String(r.official_phone)}</span> : <span className="text-ink-subtle">–</span> },
  ];

  const pop26 = n(ctx?.population?.['2026']);
  const popIndia26 = n(ctx?.india_population?.['2026']);
  const people = pop26 !== null ? pop26 * 1000 : null;
  const births = people !== null && n(ctx?.srs?.birth_rate_total) !== null ? (people * n(ctx!.srs!.birth_rate_total)!) / 1000 : null;
  const beds = n(agg?.total_beds_listed);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 lg:px-8 lg:py-12">
      <div className="flex flex-col gap-4">
        <nav aria-label={t('pl_state')} className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => setState(null)} className="min-h-10 font-medium text-brand underline-offset-4 hover:underline">India</button>
          {state && <><ChevronRight className="size-4 text-ink-subtle" aria-hidden="true" />
            <button type="button" onClick={() => setDistrict(null)} aria-current={!district ? 'page' : undefined}
                    className="min-h-10 font-medium text-brand underline-offset-4 hover:underline aria-[current=page]:text-ink aria-[current=page]:no-underline">{state}</button></>}
          {district && <><ChevronRight className="size-4 text-ink-subtle" aria-hidden="true" /><span aria-current="page" className="font-medium">{district}</span></>}
        </nav>
        <h1 className="text-2xl font-semibold lg:text-3xl">{scope || t('planner')}</h1>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-60 flex-1 flex-col gap-2 text-sm font-medium text-ink-muted sm:flex-none">{t('pl_state')}
            <select value={state ?? ''} onChange={(e) => setState(e.target.value || null)}
                    className="min-h-12 rounded-md border border-line-strong bg-surface px-4 text-base text-ink">
              <option value="">{t('selectState')}</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {state && (
            <label className="flex min-w-60 flex-1 flex-col gap-2 text-sm font-medium text-ink-muted sm:flex-none">{t('pl_district')}
              <select value={district ?? ''} onChange={(e) => setDistrict(e.target.value || null)}
                      className="min-h-12 rounded-md border border-line-strong bg-surface px-4 text-base text-ink">
                <option value="">{t('allDistricts')}</option>
                {districtNames.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-crit">{t('err_load')} {error}</p>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-2 lg:sticky lg:top-24 lg:self-start">
          <IndiaMap states={states} districts={districtNames} state={state} district={district}
                    onState={setState} onDistrict={setDistrict} label={t('pl_map')} />
          <p className="text-xs text-ink-subtle">{t(state ? 'map_hint_district' : 'map_hint_state')}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          {!state && <Card className="p-6 text-base text-ink-muted">{t('pl_placeholder')}</Card>}
          {state && !view && !error && <p role="status" className="text-sm text-ink-muted">{t('loading')}</p>}

          {view && (<>
            <Section title={t('needsAttention')} icon={<AlertTriangle className="size-5" />} sourceLabel={t('source')}
                     source={t('gapNote')}>
              {gaps.length === 0 ? <Card className="p-4 text-sm text-ink-muted">{t('noGaps')}</Card> : (
                <Card><ul>
                  {gaps.map((g, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-0">
                      <Badge tone={g.tone} icon={<AlertTriangle className="size-3" />}>{t(g.missing ? 'incomplete' : 'far')}</Badge>
                      {isState && <button type="button" onClick={() => setDistrict(g.place)} className="min-h-10 font-medium underline-offset-4 hover:underline">{g.place}</button>}
                      <span className="font-mono text-sm">{g.text}</span>
                    </li>
                  ))}
                </ul></Card>
              )}
            </Section>

            <Section title={t('totals')} icon={<Building2 className="size-5" />} sourceLabel={t('source')} source={t('srcFacilities')}>
              <Card className="p-6">
                <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                  <Stat label={t('pl_total_fac')} value={num(n(view.n_facilities))} note={t('pl_incl_hosp', { n: num(n(view.n_hospitals)) })} />
                  <Stat label={t('pl_beds')} value={num(n(view.total_beds_listed))} badge={<Badge tone="warn">{t('incomplete')}</Badge>} />
                  <Stat label={t('svc_icu')} value={num(n(view.n_icu))} unit={t('pl_centres')} />
                  <Stat label={t('pl_blood_banks')} value={num(n(view.n_blood_bank))} unit={t('pl_centres')} />
                  <Stat label={t('pl_dialysis')} value={num(n(view.n_dialysis))} unit={t('pl_centres')} />
                  <Stat label={t('svc_ct')} value={num(n(view.n_ct_scan))} unit={t('pl_centres')} note={`MRI ${num(n(view.n_mri))}`} />
                </dl>
                <p className="mt-6 text-xs text-ink-subtle">{t('notRecorded')}</p>
              </Card>
            </Section>

            <Section title={t('pl_distance')} icon={<Route className="size-5" />} sourceLabel={t('source')} source={t(isState ? 'pl_distance_note' : 'srcFacilities')}>
              <Card className="p-6">
                <ul className="flex flex-col gap-4">
                  {SERVICES.map((s) => {
                    const v = n(view[`km_nearest_${s.key}`]);
                    const worst = n(view[`max_km_nearest_${s.key}`]);
                    const tone = v === null ? 'brand' : v >= s.far * 2 ? 'crit' : v >= s.far ? 'warn' : 'ok';
                    const text = v === null ? '–' : `${num(Math.round(v))} km`;
                    return (
                      <li key={s.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 max-sm:grid-cols-[1fr_auto]">
                        <span className="text-sm">{t(s.label)}</span>
                        <span className="max-sm:col-span-2 max-sm:row-start-2"><Meter label={t(s.label)} value={v ?? 0} max={Math.max(200, s.far * 2)} valueText={text} tone={tone} /></span>
                        <span className="text-right font-mono text-sm">{text}{isState && v !== null && <Badge className="ml-2">{t('est')}</Badge>}
                          {worst !== null && <span className="block text-xs text-ink-subtle">{t('pl_worst', { km: num(Math.round(worst)) })}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Section>

            {ctx && (
              <Section title={district ? `${t('population')} · ${state}` : t('population')} icon={<Users className="size-5" />} sourceLabel={t('source')}
                       source={`${ctx.sources.population}. ${ctx.sources.srs}. ${ctx.sources.mmr}. ${t('ctx_estimates_note')}`}>
                <Card className="p-6">
                  <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <Stat label={t('ctx_pop')} value={people !== null ? num(Math.round(people)) : '–'} unit={t('people')}
                          note={popIndia26 && pop26 ? `${((pop26 / popIndia26) * 100).toFixed(1)}% · India` : undefined} />
                    <Stat label={t('ctx_births_yr')} value={births !== null ? num(Math.round(births)) : '–'} badge={<Badge>{t('est')}</Badge>} note={t('ctx_births_how')} />
                    <Stat label={t('ctx_birth')} value={num(n(ctx.srs?.birth_rate_total), 1)} unit={t('ctx_per_1000')}
                          note={<VsIndia v={n(ctx.srs?.birth_rate_total)} india={n(ctx.india_srs?.birth_rate_total)} t={t} />} />
                    <Stat label={t('ctx_imr')} value={num(n(ctx.srs?.imr_total))} unit={t('ctx_per_1000_births')}
                          note={<VsIndia v={n(ctx.srs?.imr_total)} india={n(ctx.india_srs?.imr_total)} t={t} />} />
                    <Stat label={t('ctx_mmr')} value={num(n(ctx.mmr?.mmr))} unit={t('ctx_per_lakh')}
                          badge={ctx.mmr_is_pooled ? <Badge tone="warn">{t('pooled')}</Badge> : undefined}
                          note={<VsIndia v={n(ctx.mmr?.mmr)} india={n(ctx.india_mmr?.mmr)} t={t} />} />
                    {isState && <Stat label={t('ctx_beds_1k')} value={people && beds !== null ? ((beds / people) * 1000).toFixed(2) : '–'}
                          badge={<Badge tone="warn">{t('incomplete')}</Badge>} note={t('ctx_beds_note')} />}
                  </dl>
                </Card>
              </Section>
            )}

            <Section title={t('nfhs')} icon={<HeartPulse className="size-5" />} sourceLabel={t('source')} source={t('srcNfhs')}>
              <Card className="p-6">
                <ul className="flex flex-col gap-4">
                  {NFHS.map((x) => {
                    const v = n(view[x.key]);
                    const lower = 'lower' in x && x.lower;
                    const text = v === null ? '–' : `${v.toFixed(1)}%`;
                    return (
                      <li key={x.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-4 max-sm:grid-cols-[1fr_auto]">
                        <span className="text-sm">{t(x.label)}<span className="block text-xs text-ink-subtle">{t(lower ? 'lowerBetter' : 'higherBetter')}</span></span>
                        <span className="max-sm:col-span-2 max-sm:row-start-2"><Meter label={t(x.label)} value={v ?? 0} valueText={text} /></span>
                        <span className="text-right font-mono text-sm">{text}{isState && v !== null && <Badge className="ml-2">{t('est')}</Badge>}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </Section>

            {isState && agg && (
              <Section title={t('districtsTable')} icon={<Table2 className="size-5" />}>
                <SortableTable caption={t('districtsTable')} columns={distCols} rows={agg.districts} rowKey={(r) => String(r.district)}
                               onRowClick={(r) => setDistrict(String(r.district))} />
              </Section>
            )}
            <Section title={t('facilitiesTable')} icon={<MapPinned className="size-5" />}>
              {facilities === null ? <p className="text-sm text-ink-muted">{t('loading')}</p>
                : facilities.length === 0 ? <p className="text-sm text-ink-muted">{t('pl_no_map')}</p>
                : <SortableTable caption={t('facilitiesTable')} columns={facCols} rows={facilities} maxRows={50}
                                 rowKey={(r) => `${r.name}-${r.district}-${r.lat_final}`} />}
              {facilities && facilities.length > 50 && <p className="text-xs text-ink-subtle">{t('pl_showing', { n: num(facilities.length) })}</p>}
            </Section>
          </>)}
        </div>
      </div>
    </div>
  );
}

const km = (v: unknown) => { const x = n(v); return x === null ? '–' : `${num(Math.round(x))}`; };
