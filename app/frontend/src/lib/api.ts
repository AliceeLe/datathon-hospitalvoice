import type { Lang } from './i18n';

const LANG_NAMES: Partial<Record<Lang, string>> = { hi: 'Hindi', ta: 'Tamil', te: 'Telugu' };
// Same distance expression the legacy page sends, so Genie does not improvise a broken one.
const DISTANCE_HINT =
  ' For distance in km use exactly this expression, where (lat1, lon1) is the patient location ' +
  'and (lat2, lon2) is the facility: 6371 * 2 * ASIN(SQRT(POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) + ' +
  'COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * POWER(SIN(RADIANS(lon2 - lon1) / 2), 2))).';

export type AskResult = {
  answer?: string; status?: string; conversation_id?: string | null; error?: string;
  table?: { columns: string[]; rows: unknown[][] };
  cards?: { hospitals?: { name: string }[] } | null;
};

/** First search for the intake answers. Mirrors the legacy page's question so results look the same. */
export async function askHospitals(need: string, place: string, emergency: boolean, lang: Lang): Promise<AskResult> {
  const prefix = emergency
    ? 'EMERGENCY: list the nearest capable hospitals first. '
    : 'NON-EMERGENCY: list the nearest capable hospitals first; prefer higher confidence when distances are similar. ';
  const name = LANG_NAMES[lang];
  const question = prefix +
    `The patient needs: ${need}. We are at: ${place}. ` +
    'Which hospitals near this address can provide this? Return one row per hospital, nearest first, with columns ' +
    'unique_id, name, city, service, service_label, confidence, distance_km and official_phone. ' +
    'Say if the evidence is weak.' + DISTANCE_HINT +
    (name ? ` The user may write in ${name}. Write your text answer in ${name}, but keep hospital names,` +
      ' phone numbers and column names in English.' : '');
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, want_cards: true, emergency, user_question: need }),
  });
  const data = (await res.json().catch(() => ({}))) as AskResult;
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
