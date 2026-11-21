/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const { pluralIndex, t, tn } = await import('./index');
const { ru } = await import('./ru');
const { uz } = await import('./uz');

const SRC = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?)$/.test(f) && !f.endsWith('.test.ts') && !p.includes('/i18n/') ? [p] : [];
  });
}

/** Every string literal passed as the first argument of t(...), tn(...) or tr(...) (an alias of t). */
function keysInCode(): Set<string> {
  const keys = new Set<string>();
  const re = /\b(?:t|tn|tr|msg)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const f of files(SRC)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) keys.add(m[2]!.replace(/\\(['"\\])/g, '$1'));
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const keys = keysInCode();

  it('finds the app strings', () => {
    expect(keys.size).toBeGreaterThan(100);
  });

  it.each([
    ['uz', uz],
    ['ru', ru],
  ] as const)('%s has every string used in the code', (_lang, dict) => {
    const missing = [...keys].filter((k) => !(k in dict));
    expect(missing).toEqual([]);
  });

  it.each([
    ['uz', uz],
    ['ru', ru],
  ] as const)('%s keeps the same placeholders', (_lang, dict) => {
    const wrong = Object.entries(dict).filter(([k, v]) => {
      const want = new Set(placeholders(k));
      return v.split('|').some((form) => placeholders(form).some((p) => !want.has(p!)));
    });
    expect(wrong.map(([k]) => k)).toEqual([]);
  });

  it('fills placeholders and plural forms', () => {
    expect(t('Hello, {name}', { name: 'Aziz' }, 'en')).toBe('Hello, Aziz');
    expect(pluralIndex(1, 'ru')).toBe(0);
    expect(pluralIndex(3, 'ru')).toBe(1);
    expect(pluralIndex(11, 'ru')).toBe(2);
    expect(pluralIndex(21, 'ru')).toBe(0);
    expect(tn('{n} day|{n} days', 1, undefined, 'en')).toBe('1 day');
    expect(tn('{n} day|{n} days', 5, undefined, 'en')).toBe('5 days');
  });
});
