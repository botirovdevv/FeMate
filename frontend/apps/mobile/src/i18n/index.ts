// Uzbek, Russian and English. English text is the key (gettext style): t('Sign in'). uz.ts and ru.ts map each
// English string to its translation; i18n.test.ts fails if a t(...) string in the code has no translation.
// Placeholders: t('Hello, {name}', { name }). Plurals: tn('{n} day|{n} days', n), forms split by "|"
// (English: one|other, Russian: one|few|many, Uzbek: a single form).
import { useMemo } from 'react';

import { useSettings } from '@/store/settings';
import { ru } from './ru';
import { uz } from './uz';

import type { Lang } from './device';

export { deviceLang, type Lang } from './device';
export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: 'uz', label: 'O‘zbekcha', short: 'UZ' },
  { value: 'ru', label: 'Русский', short: 'RU' },
  { value: 'en', label: 'English', short: 'EN' },
];

const DICT: Record<Exclude<Lang, 'en'>, Record<string, string>> = { uz, ru };

export const currentLang = (): Lang => useSettings.getState().language;

type Params = Record<string, string | number>;

function fill(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

function lookup(key: string, lang: Lang): string {
  if (lang === 'en') return key;
  return DICT[lang][key] ?? key;
}

/**
 * Marks a string for translation without translating it yet (module-level data). Show it with t(value) when rendering.
 */
export const msg = (s: string) => s;

/** Translate in the current language (for code outside components; components use useT). */
export function t(key: string, params?: Params, lang: Lang = currentLang()): string {
  return fill(lookup(key, lang), params);
}

/** Plural form index: English one/other, Russian one/few/many, Uzbek has one form. */
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

/** Translate a plural string: tn('{n} day|{n} days', 3). `{n}` is filled with the count. */
export function tn(key: string, n: number, params?: Params, lang: Lang = currentLang()): string {
  const forms = lookup(key, lang).split('|');
  const form = forms[Math.min(pluralIndex(n, lang), forms.length - 1)] ?? key;
  return fill(form, { n, ...params });
}

/** In components: re-renders on a language change. The functions stay the same until the language changes. */
export function useT() {
  const lang = useSettings((s) => s.language);
  return useMemo(
    () => ({
      lang,
      t: (key: string, params?: Params) => t(key, params, lang),
      tn: (key: string, n: number, params?: Params) => tn(key, n, params, lang),
    }),
    [lang],
  );
}

// Month and weekday names, so dates read right even where the phone has no Uzbek date data.
const MONTHS: Record<Lang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
};
// Russian dates use the genitive: "12 октября".
const MONTHS_OF: Record<Lang, string[]> = {
  ...MONTHS,
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const MONTHS_SHORT: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
};
// Monday first.
const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ru: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
  uz: ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'],
};
const WEEKDAYS_SHORT: Record<Lang, string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** "12 Oct" / "12 окт" / "12-okt". */
export function shortDate(d: Date, lang: Lang = currentLang()): string {
  const m = MONTHS_SHORT[lang][d.getMonth()];
  return lang === 'uz' ? `${d.getDate()}-${m}` : `${d.getDate()} ${m}`;
}

/** "October 2026" / "Октябрь 2026" / "Oktabr 2026". */
export function monthYear(d: Date, lang: Lang = currentLang()): string {
  return `${cap(MONTHS[lang][d.getMonth()]!)} ${d.getFullYear()}`;
}

/** "Monday, 12 October" / "Понедельник, 12 октября" / "Dushanba, 12-oktabr". */
export function longDay(d: Date, lang: Lang = currentLang()): string {
  const wd = cap(WEEKDAYS[lang][mondayIndex(d)]!);
  const m = MONTHS_OF[lang][d.getMonth()];
  return lang === 'uz' ? `${wd}, ${d.getDate()}-${m}` : lang === 'ru' ? `${wd}, ${d.getDate()} ${m}` : `${wd}, ${d.getDate()} ${cap(m!)}`;
}

export function monthShort(i: number, lang: Lang = currentLang()): string {
  return MONTHS_SHORT[lang][i] ?? '';
}

export function weekdayShort(i: number, lang: Lang = currentLang()): string {
  return WEEKDAYS_SHORT[lang][i] ?? '';
}

/** Weekday + time, for "works until …". */
export function weekdayTime(d: Date, lang: Lang = currentLang()): string {
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${WEEKDAYS_SHORT[lang][mondayIndex(d)]} ${hm}`;
}
