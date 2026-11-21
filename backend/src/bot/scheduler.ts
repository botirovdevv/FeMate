// Daily report scheduler (PLAN.md Stage 7): every minute, users whose report_time is now (Tashkent)
// get the report in Telegram and as a push. The report may propose today's savings transfer.
import type { FastifyBaseLogger } from 'fastify';
import { and, eq, isNotNull, or } from 'drizzle-orm';

import type { Db } from '../db/client';
import { users } from '../db/schema';
import { money } from '../lib/format';
import { dailySummary } from '../rules/dailyAllowance';
import { expoPush } from '../notify/notify';
import { dailyReport, type Report } from './core';
import { t } from '../i18n';

/** "HH:MM" in Tashkent (UTC+5) for an instant. */
export function tashkentClock(at: Date): string {
  return new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(11, 16);
}

const push = expoPush;

/** Sends every report due at `at`. Exported for tests; returns who got one. */
export async function runDueReports(
  db: Db,
  at: Date,
  send: { telegram?: (chatId: string, r: Report) => Promise<void>; push?: typeof push },
  log?: FastifyBaseLogger,
): Promise<string[]> {
  const due = await db
    .select()
    .from(users)
    .where(and(eq(users.reportTime, tashkentClock(at)), or(isNotNull(users.telegramChatId), isNotNull(users.expoPushToken))));
  const done: string[] = [];
  for (const u of due) {
    try {
      // Propose a transfer only where someone can see the Approve button.
      const r = await dailyReport(db, u.id, { propose: Boolean(u.telegramChatId && send.telegram) });
      if (u.telegramChatId && send.telegram) await send.telegram(u.telegramChatId, r);
      if (u.expoPushToken && send.push) {
        const s = await dailySummary(db, u.id);
        const body = r.pending.length
          ? t('Spent {amount} today. An agent action is waiting for your approval.', { amount: money(s.todaySpent, r.currency) }, u.language)
          : t('Spent {amount} of {limit} today.', { amount: money(s.todaySpent, r.currency), limit: money(s.dailyAllowance, r.currency) }, u.language);
        await send.push(u.expoPushToken, t('Your FeMate day', undefined, u.language), body);
      }
      done.push(u.id);
    } catch (err) {
      log?.error({ err, userId: u.id }, 'daily report failed');
    }
  }
  return done;
}

export function startScheduler(db: Db, telegram: ((chatId: string, r: Report) => Promise<void>) | undefined, log: FastifyBaseLogger) {
  let last = '';
  const timer = setInterval(() => {
    const now = new Date();
    const minute = now.toISOString().slice(0, 16);
    if (minute === last) return;
    last = minute;
    void runDueReports(db, now, { telegram, push }, log);
  }, 15_000);
  return () => clearInterval(timer);
}
