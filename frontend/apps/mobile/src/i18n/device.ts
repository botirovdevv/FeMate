// No imports on purpose: the settings store reads this while it is being created.
export type Lang = 'uz' | 'ru' | 'en';

/** The phone's language on first launch: Russian or English when the phone uses them, otherwise Uzbek. */
export function deviceLang(): Lang {
  let tag = 'uz';
  try {
    tag = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  } catch {
    // No Intl data: keep Uzbek.
  }
  if (tag.startsWith('ru')) return 'ru';
  if (tag.startsWith('en')) return 'en';
  return 'uz';
}
