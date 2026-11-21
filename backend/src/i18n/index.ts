// Server text in Uzbek, Russian and English, same scheme as the app: the English text is the key.
// t('Sign in to continue.', params, lang). Plurals: tn('{n} day|{n} days', n, params, lang), forms split by "|"
// (English one|other, Russian one|few|many, Uzbek one form). msg() marks a string for translation later.
// i18n.test.ts fails when a key used in the code has no Uzbek or Russian translation.
import { ru } from './ru';
import { uz } from './uz';

export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: readonly Lang[] = ['uz', 'ru', 'en'];

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { uz, ru };

export type Params = Record<string, string | number>;

/** The language a client asked for (Accept-Language), or null when it named none we speak. */
export function parseLang(header: string | string[] | undefined): Lang | null {
  const v = (Array.isArray(header) ? header[0] : header)?.toLowerCase() ?? '';
  for (const part of v.split(',')) {
    const tag = part.trim().slice(0, 2);
    if (tag === 'uz' || tag === 'ru' || tag === 'en') return tag;
  }
  return null;
}

export const isLang = (v: unknown): v is Lang => v === 'uz' || v === 'ru' || v === 'en';

const fill = (s: string, params?: Params) =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;

const lookup = (key: string, lang: Lang) => (lang === 'en' ? key : (DICT[lang][key] ?? key));

export function t(key: string, params?: Params, lang: Lang = 'en'): string {
  return fill(lookup(key, lang), params);
}

export function pluralIndex(n: number, lang: Lang): number {
  const a = Math.abs(Math.trunc(n));
  if (lang === 'uz') return 0;
  if (lang === 'en') return a === 1 ? 0 : 1;
  const d = a % 10;
  const dd = a % 100;
  if (d === 1 && dd !== 11) return 0;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 1;
  return 2;
}

export function tn(key: string, n: number, params?: Params, lang: Lang = 'en'): string {
  const forms = lookup(key, lang).split('|');
  return fill(forms[Math.min(pluralIndex(n, lang), forms.length - 1)] ?? key, { n, ...params });
}

/** Marks a string for translation without translating it (it is translated later with t()). */
export const msg = (s: string) => s;

/** A translatable message: an English key and its values (which may be messages too), rendered per reader. */
export interface Msg {
  key: string;
  params?: Record<string, string | number | Msg>;
}
/** Renders a message; string values that are keys themselves (category or account names) are translated too. */
export function render(m: Msg, lang: Lang): string {
  const params = m.params
    ? Object.fromEntries(
        Object.entries(m.params).map(([k, v]) => [k, typeof v === 'string' ? t(v, undefined, lang) : typeof v === 'number' ? v : render(v, lang)]),
      )
    : undefined;
  return t(m.key, params, lang);
}

// Category names, translated where a category appears in a sentence.
const CATEGORY_EN: Record<string, string> = {
  transport: msg('Transport'),
  food: msg('Food'),
  utilities: msg('Utilities'),
  shopping: msg('Shopping'),
  health: msg('Health'),
  entertainment: msg('Entertainment'),
  education: msg('Education'),
  transfer: msg('Transfer'),
  other: msg('Other'),
};
export const categoryName = (category: string, lang: Lang = 'en') => t(CATEGORY_EN[category] ?? category, undefined, lang);
/** The English name, for a Msg param (render translates it for each reader). */
export const categoryKey = (category: string) => CATEGORY_EN[category] ?? category;
