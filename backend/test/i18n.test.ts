import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { pluralIndex, render, t, tn } from '../src/i18n';
import { ru } from '../src/i18n/ru';
import { uz } from '../src/i18n/uz';

const SRC = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes('/i18n') || p.includes('/migrations') ? [] : files(p);
    return f.endsWith('.ts') ? [p] : [];
  });
}

const Q = String.raw`(['"])((?:\\.|(?!\1).)*)\1`;
// Every place the server hands an English string to the translator.
const PATTERNS = [
  String.raw`\b(?:t|tn|msg|say)\(\s*` + Q, // t('…'), msg('…')
  String.raw`\b(?:t|tn|say)\(\s*[\w.]+\s*(?:>=?|===)?\s*[\w.]*\s*\?\s*` + Q, // t(x ? '…' : …) first branch
  String.raw`\?\s*` + Q + String.raw`\s*:\s*(['"])`, // first branch of a ternary that picks keys
  String.raw`:\s*` + Q + String.raw`,\s*(?:undefined|\{|lang)`, // second branch of such a ternary
  String.raw`\bkey:\s*` + Q, // { key: '…' }
  String.raw`\bkey:\s*\w+\s*\?\s*` + Q, // key: cond ? '…' : '…'
  String.raw`new ApiError\(\s*\d+,\s*'[A-Z_]+',\s*` + Q, // new ApiError(400, 'CODE', '…')
  String.raw`\bblock\(\s*'[A-Z_]+',\s*` + Q, // Policy Guard block('CODE', '…')
  String.raw`\breason:\s*` + Q, // audit({ reason: '…' })
  String.raw`\.(?:min|max|length|regex)\([^()]*?,\s*` + Q + String.raw`\)`, // zod custom messages
  String.raw`z\.email\(\s*` + Q,
];

function keysInCode(): Set<string> {
  const keys = new Set<string>();
  for (const f of files(SRC)) {
    const src = readFileSync(f, 'utf8');
    for (const p of PATTERNS) {
      for (const m of src.matchAll(new RegExp(p, 'g'))) {
        const k = m[2]!.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
        if (/[a-z]{2}/i.test(k) && !/^[a-z_]+$/.test(k)) keys.add(k);
      }
    }
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

describe('server translations', () => {
  const keys = keysInCode();

  it('finds the server strings', () => {
    expect(keys.size).toBeGreaterThan(150);
  });

  it.each([
    ['uz', uz],
    ['ru', ru],
  ] as const)('%s has every string used in the code', (_lang, dict) => {
    expect([...keys].filter((k) => !(k in dict))).toEqual([]);
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

  it('renders messages, nested messages and plurals', () => {
    expect(t('Sign in to continue.', undefined, 'en')).toBe('Sign in to continue.');
    expect(render({ key: '{what}: {reason}', params: { what: 'x', reason: { key: 'That amount is too small.' } } }, 'en')).toBe('x: That amount is too small.');
    expect(pluralIndex(22, 'ru')).toBe(1);
    expect(tn('Agent disabled. {n} pending action rejected.|Agent disabled. {n} pending actions rejected.', 2, undefined, 'en')).toBe(
      'Agent disabled. 2 pending actions rejected.',
    );
  });

  it('answers errors in the language the client asks for', async () => {
    const { setup } = await import('./helpers');
    const s = await setup();
    const res = await s.app.inject({ method: 'GET', url: '/api/v1/me', headers: { 'accept-language': 'ru' } });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { message: string } }>().error.message).toBe(ru['Sign in to continue.']);
    await s.close();
  });

  it('the agent, the check-in and errors follow the app language', async () => {
    const { setup } = await import('./helpers');
    const s = await setup();
    const login = await s.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'aziz@femate.uz', password: 'demo1234' } });
    const token = login.json<{ token: string }>().token;
    const call = (lang: string, method: 'GET' | 'POST', url: string, payload?: object) =>
      s.app.inject({ method, url: `/api/v1${url}`, payload, headers: { authorization: `Bearer ${token}`, 'accept-language': lang } });

    // Russian: the reply to the app's own suggestion is Cyrillic.
    const ru1 = await call('ru', 'POST', '/agent/chat', { message: 'Сколько осталось на сегодня?' });
    expect(ru1.json<{ reply: string }>().reply).toMatch(/Сегодня осталось|Вы превысили/);
    // Uzbek: same question, Uzbek answer; the stored language follows the app.
    const uz1 = await call('uz', 'POST', '/agent/chat', { message: 'Bugun qancha qoldi?' });
    expect(uz1.json<{ reply: string }>().reply).toMatch(/Bugun .* qoldi|limitdan .* oshdingiz/);
    const insight = await call('uz', 'GET', '/summary/insight');
    expect(insight.statusCode).toBe(200);
    // A validation message from the schema, in Uzbek.
    const bad = await call('uz', 'POST', '/transactions', { text: '' });
    expect(bad.json<{ error: { message: string } }>().error.message).toContain('masalan');
    await s.close();
  });
});
