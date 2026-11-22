import type { Lang } from './i18n';

// Defined by static/i18n.js (shared with the legacy page).
declare const SERVICE_I18N: Record<string, Record<string, string>> | undefined;
declare const BULLET_PATTERNS: Record<string, { beds: string; bedsMissing: string; missing: string }> | undefined;

/** Service bullets come from the data in English; translate the common ones. */
export function trService(b: string, lang: Lang): string {
  if (lang === 'en' || !b) return b;
  const pat = typeof BULLET_PATTERNS !== 'undefined' ? BULLET_PATTERNS[lang] : undefined;
  const map = (typeof SERVICE_I18N !== 'undefined' ? SERVICE_I18N[lang] : undefined) ?? {};
  let m: RegExpMatchArray | null;
  if (pat && (m = b.match(/^(\d+) beds$/))) return pat.beds.replace('{n}', m[1]);
  if (pat && b === 'Bed count not listed') return pat.bedsMissing;
  if (pat && (m = b.match(/^(.*) information not listed$/))) return pat.missing.replace('{x}', trService(m[1], lang));
  return map[b] ?? b;
}

export const isMissing = (b: string) => /not listed/i.test(b);
