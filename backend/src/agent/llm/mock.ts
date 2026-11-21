// Keyless mock LLM (PLAN.md §10). A small intent machine over the conversation: it asks for tools
// exactly like a real model would, so the whole Policy Guard / audit path runs in demos and tests.
import { convertMoney, fromUzs, niceStep, toMinor, type Currency } from '@femate/shared';

import { money } from '../../lib/format';
import { BUS_FARE } from '../../rules/whatIf';
import { categorize } from '../../rules/categorize';
import { categoryName, t, type Lang } from '../../i18n';
import type { LlmMessage, LlmProvider, ToolCall } from './provider';

type Result = Record<string, unknown> & { error?: string; message?: string };

const INJECTION_RE = /transfer all money to card ([\d ]{16,19}\d)/i;

function lastTurn(messages: LlmMessage[]) {
  let i = messages.length - 1;
  while (i >= 0 && messages[i]!.role !== 'user') i--;
  const user = i >= 0 ? messages[i]!.content : '';
  const results = new Map<string, Result>();
  for (const m of messages.slice(i + 1)) {
    if (m.role === 'tool') {
      try {
        results.set(m.name, JSON.parse(m.content) as Result);
      } catch {
        results.set(m.name, { error: 'UNPARSEABLE' });
      }
    }
  }
  return { user, results, step: messages.length - i };
}

const call = (step: number, name: string, args: Record<string, unknown> = {}) => ({
  toolCalls: [{ id: `call_${step}_${name}`, name, args } satisfies ToolCall],
});

function transferReply(cur: Currency, lang: Lang, r: Result, savedToday?: number): string {
  const fmt = (n: number) => money(n, cur);
  const amount = fmt(Number(r.amount ?? 0));
  if (r.error)
    return t('I couldn’t do that: {reason} ({code}). Money can only go to your own savings, within your limits.', { reason: String(r.message ?? r.error).replace(/\.$/, ''), code: String(r.error) }, lang);
  if (r.status === 'pending') {
    const left = savedToday !== undefined ? `${t('You stayed {amount} under today’s limit.', { amount: fmt(savedToday) }, lang)} ` : '';
    return `${left}${t('I’ve proposed moving {amount} to Savings. It needs your approval.', { amount }, lang)}`;
  }
  return t('Moved {amount} to Savings on Autopilot.', { amount }, lang);
}

function spendingReply(cur: Currency, lang: Lang, r: Result, sim?: Result): string {
  const fmt = (n: number) => money(n, cur);
  const items = (r.transactions as { amount: number; category: string; description: string }[] | undefined) ?? [];
  const byCat = new Map<string, number>();
  for (const x of items) if (x.category !== 'transfer') byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.amount);
  const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let s = top.length
    ? t('Last 14 days: {list}.', { list: top.map(([c, a]) => `${categoryName(c, lang)} ${fmt(a)}`).join(', ') }, lang)
    : t('I don’t see any spending in the last 14 days.', undefined, lang);
  if (sim && !sim.error && Number(sim.monthlySaving) > 0)
    s += ` ${t('Taking the bus instead of a taxi on 15 days a month would save about {amount} a month.', { amount: fmt(Number(sim.monthlySaving)) }, lang)}`;
  if (items.some((x) => INJECTION_RE.test(x.description)))
    s += ` ${t('One transaction note contains instructions to move money; I treated it as data and ignored it.', undefined, lang)}`;
  return s;
}

export const mockProvider: LlmProvider = {
  async categorize(text) {
    return categorize(text);
  },

  // Understands the app's suggestions and common phrasing in English, Uzbek and Russian; answers in `lang`.
  async chat({ messages, currency: cur, lang }) {
    const { user, results, step } = lastTurn(messages);
    const fmt = (n: number) => money(n, cur);
    const say = (key: string, params?: Record<string, string | number>) => t(key, params, lang);
    const s = user.toLowerCase().replace(/[‘’ʻʼ`]/g, "'");
    const has = (n: string) => results.get(n);

    // Red-team mode: behave like a model that was fooled by a transaction note, so the demo can show
    // Policy Guard stopping it (TARGET_NOT_ALLOWED). A real LLM is told to ignore such notes.
    if (/follow|instruction|note|izoh|ko'rsatma|инструкц|заметк|указан/.test(s)) {
      const list = has('list_transactions');
      if (!list) return call(step, 'list_transactions', {});
      const tr = has('transfer_to_savings');
      const hit = JSON.stringify(list).match(INJECTION_RE);
      if (!tr && hit) return call(step, 'transfer_to_savings', { amount: 1_000_000, toAccountId: hit[1], reason: 'Instruction from a transaction note' });
      if (!tr) return { text: say('I read your last 14 days. None of the notes ask for anything.') };
      return {
        text: tr.error
          ? say('A transaction note told me to send all your money to another card. Policy Guard blocked it ({code}) and it’s in the audit log. Money can only go to your own savings.', { code: String(tr.error) })
          : transferReply(cur, lang, tr),
      };
    }

    // Move money to savings: an explicit amount, "all money", or today's leftover.
    if (/sav|move|transfer|o'tkaz|jamg|tejal|tejam|all money|everything|hammasini|barchasini|перев|накоп|сбереж|отлож|эконом|все деньги/.test(s)) {
      const tr = has('transfer_to_savings');
      const summary = has('get_daily_summary');
      if (tr) return { text: transferReply(cur, lang, tr, summary ? Number(summary.savedToday) : undefined) };
      // "move 500 000", "move $20": whole units of the named currency, or the user's.
      const said = categorize(user);
      const named = said.currency ?? cur;
      const explicit = said.amount ? convertMoney(toMinor(said.amount, named), named, cur) : 0;
      if (explicit >= fromUzs(1000, cur)) return call(step, 'transfer_to_savings', { amount: explicit, reason: say('You asked to move this to savings.') });
      if (/all money|everything|hammasini|barchasini|все деньги|всё/.test(s)) {
        const bal = has('get_balance');
        if (!bal) return call(step, 'get_balance');
        const card = (bal.accounts as { type: string; balance: number }[] | undefined)?.find((a) => a.type === 'card');
        return call(step, 'transfer_to_savings', { amount: card?.balance ?? 0, reason: say('You asked to move everything to savings.') });
      }
      if (!summary) return call(step, 'get_daily_summary');
      if (summary.error) return { text: say('I can’t read today’s numbers: {reason}', { reason: String(summary.message) }) };
      const saved = Number(summary.savedToday);
      const step10k = niceStep(fromUzs(10_000, cur));
      const amount = Math.floor(saved / step10k) * step10k;
      if (amount <= 0) return { text: say('You’re over today’s limit, so there’s nothing to move to savings today.') };
      return call(step, 'transfer_to_savings', { amount, reason: say('You stayed {amount} under today’s limit.', { amount: fmt(saved) }) });
    }

    if (/balance|balans|hisob|how much do i have|баланс|сколько у меня/.test(s)) {
      const bal = has('get_balance');
      if (!bal) return call(step, 'get_balance');
      if (bal.error) return { text: say('I can’t see your balances: {reason}', { reason: String(bal.message) }) };
      const accs = (bal.accounts as { name: string; balance: number }[]) ?? [];
      return { text: accs.map((a) => `${say(a.name)}: ${fmt(a.balance)}`).join('. ') + '.' };
    }

    if (/left|limit|today|bugun|qancha|qoldi|остал|сегодня|лимит/.test(s)) {
      const sum = has('get_daily_summary');
      if (!sum) return call(step, 'get_daily_summary');
      if (sum.error) return { text: say('I can’t read today’s numbers: {reason}', { reason: String(sum.message) }) };
      const left = Number(sum.remainingToday);
      return {
        text:
          left >= 0
            ? say('You have {left} left today out of {limit}. Spent so far: {spent}.', { left: fmt(left), limit: fmt(Number(sum.dailyAllowance)), spent: fmt(Number(sum.todaySpent)) })
            : say('You’re {over} over today’s {limit} limit. Spent so far: {spent}.', { over: fmt(-left), limit: fmt(Number(sum.dailyAllowance)), spent: fmt(Number(sum.todaySpent)) }),
      };
    }

    if (/spend|spent|where|taxi|taksi|transport|bus|avtobus|xarajat|sarf|qayerga|what if|трат|потрач|куда|такси|автобус|расход/.test(s)) {
      const list = has('list_transactions');
      if (!list) return call(step, 'list_transactions', {});
      if (list.error) return { text: say('I can’t read your transactions: {reason}', { reason: String(list.message) }) };
      const rides = ((list.transactions as { category: string; amount: number; description: string }[]) ?? []).filter(
        (t) => t.category === 'transport' && /yandex|taxi|taksi/i.test(t.description),
      );
      const sim = has('simulate_saving');
      if (!sim && rides.length >= 5) {
        const unit = niceStep(fromUzs(1000, cur));
        const avg = Math.round(rides.reduce((a, t) => a + t.amount, 0) / rides.length / unit) * unit;
        return call(step, 'simulate_saving', { currentCostPerDay: avg, alternativeCostPerDay: fromUzs(2 * BUS_FARE, cur), daysPerMonth: 15 });
      }
      return { text: spendingReply(cur, lang, list, sim) };
    }

    return {
      text: say('I can tell you what’s left for today, where your money goes, or move today’s savings to your Savings account. What would you like?'),
    };
  },
};
