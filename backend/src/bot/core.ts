// Telegram bot logic without Telegram (PLAN.md Stage 7), so tests can drive it on PGlite.
// The bot reads and adds expenses. Money moves only through an inline Approve button on an
// agent action that Policy Guard already let through (PLAN.md §8), never from a typed command.
import { formatMoney, toMinor, type AgentAction, type Currency } from '@femate/shared';
import { and, eq, gt } from 'drizzle-orm';

import { dailyInsight } from '../agent/insights';
import type { LlmProvider } from '../agent/llm/provider';
import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { addExpense, parsedExpense, spentText } from '../bank/expenses';
import type { Db } from '../db/client';
import { agentActions, permissions, telegramLinkCodes, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { toAction } from '../lib/serialize';
import { approveAction, expirePending, proposeAction, rejectAction } from '../policy/actions';
import { dailySummary } from '../rules/dailyAllowance';
import { parseSms } from '../rules/smsParser';
import { categoryName, render, t, type Lang, type Params } from '../i18n';
import { userLang } from '../i18n/user';

/** The bot's help text in a language. */
export const help = (lang: Lang = 'en') =>
  [
    t('Send me what you spent and I’ll add it to FeMate:', undefined, lang),
    '• taxi 20000  •  lunch 35k  •  coffee 18k  •  coffee $4.50',
    t('• Send a voice note: “taxi twenty thousand” or “lunch twelve dollars”.', undefined, lang),
    t('• Forward a bank SMS (Uzcard / Humo) and I’ll read it.', undefined, lang),
    '',
    t('/today: today’s report', undefined, lang),
    t('/unlink: disconnect this chat', undefined, lang),
    '',
    t('I can read and add expenses. I can never move money on my own: transfers need your tap on Approve.', undefined, lang),
  ].join('\n');

export async function userByChat(db: Db, chatId: string) {
  const [u] = await db.select().from(users).where(eq(users.telegramChatId, chatId));
  return u ?? null;
}

/** /start <code>: tie this chat to the account that asked for the code in the app. `lang`: Telegram's, until linked. */
export async function linkChat(db: Db, chatId: string, code: string, lang: Lang = 'en'): Promise<string> {
  const [row] = await db
    .select()
    .from(telegramLinkCodes)
    .where(and(eq(telegramLinkCodes.code, code), gt(telegramLinkCodes.expiresAt, new Date())));
  if (!row) return t('That code is wrong or has expired. In the app open Settings → Telegram bot → Get a link code, then send /start <code>.', undefined, lang);
  await db.transaction(async (tx) => {
    // One chat, one account: a chat linked before moves to the new account.
    await tx.update(users).set({ telegramChatId: null }).where(eq(users.telegramChatId, chatId));
    await tx.update(users).set({ telegramChatId: chatId }).where(eq(users.id, row.userId));
    await tx.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, row.userId));
  });
  await audit(db, row.userId, {
    actor: 'user',
    event: 'telegram.link',
    decision: 'info',
    reason: 'Telegram chat linked. The bot can read and add expenses; it cannot move money.',
  });
  const [u] = await db.select({ name: users.name, language: users.language }).from(users).where(eq(users.id, row.userId));
  const ul = u?.language ?? lang;
  return `${t('Linked! Hi {name} 👋', { name: u?.name ?? '' }, ul)}\n\n${help(ul)}`;
}

export async function unlinkChat(db: Db, userId: string): Promise<string> {
  await db.update(users).set({ telegramChatId: null }).where(eq(users.id, userId));
  await audit(db, userId, { actor: 'user', event: 'telegram.unlink', decision: 'info', reason: 'Telegram chat unlinked.' });
  return t('Done. This chat is no longer linked to FeMate. Get a new code in the app to link again.', undefined, await userLang(db, userId));
}

/** A typed expense ("taxi 20000") or a forwarded bank SMS. Text from Telegram is untrusted: it is only parsed, never obeyed. */
export async function handleText(db: Db, llm: LlmProvider, userId: string, text: string): Promise<string> {
  const own = await userCurrency(db, userId);
  const lang = await userLang(db, userId);
  const sms = parseSms(text);
  if (sms) {
    const amount = toMinor(sms.amount, sms.currency);
    if (sms.direction === 'in') return t('That’s money coming in (+{amount}), so I didn’t add it as spending.', { amount: formatMoney(amount, sms.currency) }, lang);
    const { category } = await llm.categorize(sms.merchant || text);
    const description = sms.merchant ? titleCase(sms.merchant) : t('Card payment', undefined, lang);
    const tx = await addExpense(
      db,
      userId,
      { amount, currency: sms.currency, category, description, source: 'sms_forward', occurredAt: sms.occurredAt ?? undefined },
      'card',
    );
    return `✅ ${t('From the SMS: {what}, {amount} ({category}).', { what: description, amount: spentText(tx, own), category: categoryName(category, lang) }, lang)}\n${await leftToday(db, userId, own, lang)}`;
  }
  const c = await llm.categorize(text);
  if (!c.amount || c.amount <= 0) return t('I couldn’t find an amount. Try “taxi 20000” or “lunch 35k”.', undefined, lang);
  const tx = await addExpense(db, userId, { ...(await parsedExpense(db, userId, { ...c, amount: c.amount })), source: 'manual' });
  return `✅ ${t('Added: {what}, {amount} ({category}).', { what: c.description, amount: spentText(tx, own), category: categoryName(c.category, lang) }, lang)}\n${await leftToday(db, userId, own, lang)}`;
}

/** A voice note, already turned into text. Same rules as a typed expense, saved with source voice. */
export async function handleVoice(db: Db, llm: LlmProvider, userId: string, transcript: string): Promise<string> {
  const lang = await userLang(db, userId);
  if (!transcript) return t('I didn’t hear anything. Try again, like “taxi 20000”.', undefined, lang);
  const heard = `🎤 “${transcript.slice(0, 200)}”`;
  const c = await llm.categorize(transcript);
  if (!c.amount || c.amount <= 0) return `${heard}\n${t('I couldn’t find an amount. Try “taxi 20000” or type it.', undefined, lang)}`;
  const own = await userCurrency(db, userId);
  const tx = await addExpense(db, userId, { ...(await parsedExpense(db, userId, { ...c, amount: c.amount })), source: 'voice' });
  return `${heard}\n✅ ${t('Added: {what}, {amount} ({category}).', { what: c.description, amount: spentText(tx, own), category: categoryName(c.category, lang) }, lang)}\n${await leftToday(db, userId, own, lang)}`;
}

async function leftToday(db: Db, userId: string, cur: Currency, lang: Lang) {
  const s = await dailySummary(db, userId);
  const fmt = (n: number) => formatMoney(n, cur);
  return s.remainingToday >= 0
    ? t('Left for today: {left} of {limit}.', { left: fmt(s.remainingToday), limit: fmt(s.dailyAllowance) }, lang)
    : t('You’re {over} over today’s {limit}.', { over: fmt(-s.remainingToday), limit: fmt(s.dailyAllowance) }, lang);
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export interface Report {
  text: string;
  /** The user's language, for the buttons and action texts sent with the report. */
  lang: Lang;
  /** Pending actions to show with Approve / Reject buttons. */
  pending: AgentAction[];
  currency: Currency;
}

/**
 * Today's numbers. With `propose` (the scheduled evening report) the agent also offers to move
 * today's unspent allowance to savings: pending at L2 (buttons), done at L3, nothing below L2.
 */
export async function dailyReport(db: Db, userId: string, opts: { propose?: boolean } = {}): Promise<Report> {
  const s = await dailySummary(db, userId);
  const cur = await userCurrency(db, userId);
  const lang = await userLang(db, userId);
  const say = (key: string, params?: Params) => t(key, params, lang);
  const fmt = (n: number) => formatMoney(n, cur);
  const lines = [
    `📊 ${say('FeMate report for {date}', { date: s.date })}`,
    '',
    say('Spent today: {amount}', { amount: fmt(s.todaySpent) }),
    say('Daily allowance: {amount}', { amount: fmt(s.dailyAllowance) }),
    s.remainingToday >= 0 ? say('Left: {amount}', { amount: fmt(s.remainingToday) }) : say('Over by: {amount}', { amount: fmt(-s.remainingToday) }),
  ];
  if (s.byCategory.length) {
    lines.push('', ...s.byCategory.slice(0, 5).map((c) => `• ${categoryName(c.category, lang)}: ${fmt(c.amount)}`));
  }

  const insight = await dailyInsight(db, userId, s.date);
  if (insight.status === 'over') lines.push('', insight.headline, insight.body, ...insight.tips.slice(0, 2).map((tip) => `💡 ${tip.text}`));

  if (opts.propose && s.savedToday > 0) {
    const [p] = await db.select().from(permissions).where(eq(permissions.userId, userId));
    if (p?.agentEnabled && (p.level === 'L2' || p.level === 'L3')) {
      const r = await proposeAction(db, userId, 'transfer_to_savings', { amount: s.savedToday }, {
        actor: 'agent',
        reason: say('Unspent daily allowance on {date}', { date: s.date }),
      });
      lines.push('', r.action.status === 'blocked' ? say('I wanted to save {amount}, but: {reason}', { amount: fmt(s.savedToday), reason: r.message }) : `💰 ${r.message}`);
    }
  }

  await expirePending(db, userId);
  const pending = await db
    .select()
    .from(agentActions)
    .where(and(eq(agentActions.userId, userId), eq(agentActions.status, 'pending')));
  if (!pending.length) lines.push('', s.remainingToday >= 0 ? say('Nice work today 👏') : say('Tomorrow is a new day. You’ve got this.'));
  return { text: lines.join('\n'), pending: pending.map(toAction), currency: cur, lang };
}

export function describeAction(a: AgentAction, cur: Currency, lang: Lang = 'en'): string {
  return a.type === 'transfer_to_savings'
    ? t('Move {amount} from Card to Savings?\nReason: {reason}', { amount: formatMoney(a.amount ?? 0, cur), reason: a.reason }, lang)
    : t('Set a budget? {reason}', { reason: a.reason }, lang);
}

/** An Approve / Reject tap. Approval goes through the same re-check as in the app. */
export async function decideAction(db: Db, userId: string, id: string, decision: 'approve' | 'reject'): Promise<string> {
  const lang = await userLang(db, userId);
  try {
    const a = await (decision === 'approve' ? approveAction : rejectAction)(db, userId, id);
    if (a.status !== 'executed') return `❌ ${t('Rejected. Nothing was changed.', undefined, lang)}`;
    return a.type === 'transfer_to_savings'
      ? `✅ ${t('Done: {amount} moved to Savings.', { amount: formatMoney(a.amount ?? 0, await userCurrency(db, userId)) }, lang)}`
      : `✅ ${t('Done: budget set.', undefined, lang)}`;
  } catch (e) {
    if (e instanceof ApiError) return `⚠️ ${render({ key: e.message, params: e.params }, lang)}`;
    throw e;
  }
}
