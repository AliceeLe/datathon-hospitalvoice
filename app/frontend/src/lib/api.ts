import type { Lang } from './i18n';

const LANG_NAMES: Partial<Record<Lang, string>> = { hi: 'Hindi', ta: 'Tamil', te: 'Telugu' };
// Same distance expression the legacy page sends, so Genie does not improvise a broken one.
const DISTANCE_HINT =
  ' For distance in km use exactly this expression, where (lat1, lon1) is the patient location ' +
  'and (lat2, lon2) is the facility: 6371 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) + ' +
  'COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * POWER(SIN(RADIANS(lon2 - lon1) / 2), 2))).';

function langHint(lang: Lang): string {
  const name = LANG_NAMES[lang];
  return name ? ` The user may write in ${name}. Write your text answer in ${name}, but keep hospital names,` +
    ' phone numbers and column names in English.' : '';
}
function prefix(emergency: boolean): string {
  return emergency ? 'EMERGENCY: list the nearest capable hospitals first. '
    : 'NON-EMERGENCY: list the nearest capable hospitals first; prefer higher confidence when distances are similar. ';
}

export type Hospital = {
  id?: string | null; name: string; km: number | null; address: string | null; bullets: string[];
  phone: string | null; phone_raw: string | null; search?: string;
  refusals?: { n: number; top_reason: string | null } | null;
};
export type Cards = { title?: string | null; subtitle?: string | null; hospitals: Hospital[]; primary_label?: string | null; where?: string | null };
export type AskResult = {
  answer?: string; status?: string; conversation_id?: string | null; error?: string;
  table?: { columns: string[]; rows: unknown[][] }; cards?: Cards | null;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** First search for the intake answers. Mirrors the legacy page's question so results look the same. */
export function askHospitals(need: string, place: string, emergency: boolean, lang: Lang): Promise<AskResult> {
  const question = prefix(emergency) +
    `The patient needs: ${need}. We are at: ${place}. ` +
    'Which hospitals near this address can provide this? Return one row per hospital, nearest first, with columns ' +
    'unique_id, name, city, service, service_label, confidence, distance_km and official_phone. ' +
    'Say if the evidence is weak.' + DISTANCE_HINT + langHint(lang);
  return post<AskResult>('/api/ask', { question, want_cards: true, emergency, user_question: need });
}

/** Follow-up in the same Genie conversation; answers about the hospitals already shown. */
export function askFollowUp(q: string, conversationId: string | null, emergency: boolean, suggested: string[], lang: Lang) {
  const context = suggested.length ? ' Hospitals already suggested in this chat: ' + suggested.slice(0, 10).join('; ') +
    '. Words like "these", "them" or "which of" refer to these hospitals, so only answer about them.' : '';
  const question = prefix(emergency) + q +
    ' If the answer is about specific hospitals, return one row per hospital with columns ' +
    'unique_id, name, city and distance_km, nearest first. Keep the answer short.' + DISTANCE_HINT + context + langHint(lang);
  return post<AskResult>('/api/ask', { question, conversation_id: conversationId, want_cards: true, compact: true,
                                        user_question: q, emergency });
}

const INSUFFICIENT_RE = new RegExp([
  'no answer returned', '^error', '\\bno (hospitals?|facilit(y|ies)|data|records?|information|results?)\\b',
  '(were|was) not found', 'not (available|listed|mentioned|recorded|specified)', 'insufficient',
  '(do|does|did) not (have|contain|include|mention|list|specify)', 'unable to', 'cannot (determine|find|confirm)',
  'no (specific )?(evidence|mention|details?)', "isn't available", 'not enough'].join('|'), 'i');

/** Same rule as the legacy page: Genie failed, or said the data is missing and returned no rows. */
export function isInsufficient(d: AskResult): boolean {
  const hasRows = !!d.table?.rows?.length;
  if (d.error || (d.status && d.status !== 'COMPLETED')) return true;
  if (!d.answer || !d.answer.trim()) return true;
  return !hasRows && INSUFFICIENT_RE.test(d.answer);
}

// ── Referral flow (/api/ref) ──────────────────────────────────────────────────
export const ref = {
  start: (body: unknown) => post<{ case_id: string }>('/api/ref/start', body),
  call: (caseId: string, body: unknown) => post<{ ok: boolean; next?: Hospital | null }>(`/api/ref/case/${caseId}/call`, body),
  switchHospital: (caseId: string, hospital: Hospital) => post<{ ok: boolean }>(`/api/ref/case/${caseId}/hospital`, { hospital }),
  confirm: (caseId: string, body: unknown) =>
    post<{ patient_name: string; hospital_name: string; appointments: { scheduled_at: string }[] }>(`/api/ref/case/${caseId}/confirm`, body),
  tracker: () => get<TrackerData>('/api/ref/tracker'),
  remind: (apptId: string) => post<{ ok: boolean }>(`/api/ref/appt/${apptId}/remind`, {}),
  addPatient: (body: unknown) => post<{ case_id: string }>('/api/ref/patients', body),
  addAppointment: (body: unknown) => post<{ ok: boolean }>('/api/ref/appointments', body),
};

export type Appointment = {
  appointment_id: string; case_id: string; hospital_name: string | null; service_code: string | null;
  scheduled_at: string; reminder_call_done_at: string | null; patient_name: string | null;
  patient_phone: string | null; consent_to_reminders: boolean | null; condition: string | null;
};
export type PatientCase = {
  case_id: string; status: string | null; hospital_name: string | null; patient_name: string; age_years: number | null;
  patient_phone: string | null; condition: string | null; address: string | null; secondary_contacts: string | null;
  care_program: string | null; genie_conversation_id: string | null; next_visit: string | null; is_emergency: boolean | null;
};
export type TrackerData = { appointments: Appointment[]; cases: PatientCase[] };

// ── Planner (/api/dashboard) ─────────────────────────────────────────────────
export type Row = Record<string, string | number | null>;
export type StateContext = {
  population: Record<string, number>; india_population: Record<string, number>;
  srs: Row | null; india_srs: Row | null; mmr: Row | null; mmr_is_pooled: boolean; india_mmr: Row | null;
  sources: { population: string; srs: string; mmr: string };
};
export const dashboard = {
  states: () => get<{ states: string[] }>('/api/dashboard/states'),
  districts: (state: string) => get<{ districts: Row[] }>(`/api/dashboard/districts?state=${encodeURIComponent(state)}`),
  state: (state: string) => get<Row & { districts: Row[] }>(`/api/dashboard/state?state=${encodeURIComponent(state)}`),
  district: (state: string, district: string) =>
    get<Row>(`/api/dashboard/district?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`),
  facilities: (state: string, district?: string | null) =>
    get<{ facilities: Row[] }>(`/api/dashboard/facilities?state=${encodeURIComponent(state)}${district ? `&district=${encodeURIComponent(district)}` : ''}`),
  context: (state: string) => get<StateContext>(`/api/dashboard/state_context?state=${encodeURIComponent(state)}`),
};

/** API numbers often arrive as strings ("952.0"); null stays null. */
export function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
