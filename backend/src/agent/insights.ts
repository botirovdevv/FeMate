// The assistant's daily check-in: how today and the month compare with the plan, and concrete ways
// to get back on it. Rule-based so every number comes from the Rules Engine, never from the LLM.
import { fromUzs, niceStep, type Currency, type DailyInsight, type InsightTip, type MonthPlan } from '@femate/shared';
import { eq } from 'drizzle-orm';

import { userCurrency } from '../bank/currency';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { notFound } from '../lib/errors';
import { money } from '../lib/format';
import { monthPlan } from '../rules/monthPlan';
import { BUS_FARE } from '../rules/whatIf';
import { t, type Lang, type Params } from '../i18n';

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/** Pure: the check-in text for a month plan. Exported for tests. */
export function buildDailyInsight(name: string, plan: MonthPlan, currency: Currency, lang: Lang = 'en'): DailyInsight {
  const fmt = (n: number) => money(n, currency);
  const say = (key: string, params?: Params) => t(key, params, lang);
  const who = firstName(name);
  const overToday = plan.todaySpent > plan.dailyAllowance;
  const overMonth = plan.monthSpent > plan.plannedToDate;
  const status = overToday || overMonth ? 'over' : 'on_track';

  const headline = overToday
    ? say('Hey {name}, today you spent {pct}% more than your daily plan.', { name: who, pct: plan.todayOverPct })
    : overMonth
      ? say('Hey {name}, you’re within today’s plan, but the month is running ahead of it.', { name: who })
      : say('Nice, {name}: you’re {amount} under today’s plan.', { name: who, amount: fmt(plan.dailyAllowance - plan.todaySpent) });

  let body: string;
  if (plan.daysLeft === 0) {
    body = say('It’s the last day of the month: {spent} spent of {budget}.', { spent: fmt(plan.monthSpent), budget: fmt(plan.monthBudget) });
  } else if (plan.monthSpent >= plan.monthBudget) {
    body = say('This month’s budget of {budget} is used up. Keep the remaining {days} days to essentials only.', { budget: fmt(plan.monthBudget), days: plan.daysLeft });
  } else if (overMonth) {
    body = say('To land on your monthly plan, keep each of the remaining {days} days under {limit}: that’s {cut} less than your usual {usual} a day.', {
      days: plan.daysLeft,
      limit: fmt(plan.catchUpDaily),
      cut: fmt(plan.cutPerDay),
      usual: fmt(plan.dailyAllowance),
    });
  } else if (overToday) {
    body = say('The month is still on pace: the remaining {days} days allow {limit} a day.', { days: plan.daysLeft, limit: fmt(plan.catchUpDaily) });
  } else {
    body = say('This month: {spent} of {budget} spent, {days} days left at {limit} a day.', {
      spent: fmt(plan.monthSpent),
      budget: fmt(plan.monthBudget),
      days: plan.daysLeft,
      limit: fmt(plan.catchUpDaily),
    });
  }

  return { status, headline, body, tips: status === 'over' ? buildTips(plan, currency, lang) : [], plan };
}

/** Up to three tips for the categories that cost the most this week, biggest saving first. */
function buildTips(plan: MonthPlan, currency: Currency, lang: Lang): InsightTip[] {
  const fmt = (n: number) => money(n, currency);
  const say = (key: string, params?: Params) => t(key, params, lang);
  const unit = niceStep(fromUzs(1_000, currency));
  const round = (n: number) => Math.round(n / unit) * unit;
  const days = Math.max(1, plan.daysLeft);
  // What the user needs to win back: the month's overspend so far, or today's.
  const gap = Math.max(plan.monthSpent - plan.plannedToDate, plan.todaySpent - plan.dailyAllowance, 0);
  const tips: InsightTip[] = [];

  for (const trend of plan.categoryTrends) {
    const perDay = trend.thisWeek / 7;
    if (perDay <= 0) continue;
    if (trend.category === 'food') {
      const cut = round(perDay / 3);
      if (cut > 0)
        tips.push({
          category: 'food',
          text: say('Bring lunch from home or cook dinner at home. Cutting food by a third saves about {amount} a day.', { amount: fmt(cut) }),
          saving: cut * days,
        });
    } else if (trend.category === 'transport') {
      const busTrip = fromUzs(2 * BUS_FARE, currency);
      const perDayCut = round(Math.max(0, perDay - busTrip));
      if (perDayCut <= 0) continue;
      const n = Math.min(days, Math.max(1, Math.ceil((gap || perDayCut * days / 2) / perDayCut)));
      tips.push({
        category: 'transport',
        text:
          gap > 0
            ? say('Walk or take the bus instead of a taxi for {n} days. That alone wins back the {amount} you’re over.', { n, amount: fmt(gap) })
            : say('Walk or take the bus instead of a taxi for {n} days to save about {amount}.', { n, amount: fmt(perDayCut * n) }),
        saving: perDayCut * n,
      });
    } else if (trend.category === 'shopping' || trend.category === 'entertainment') {
      const week = round(trend.thisWeek);
      if (week > 0)
        tips.push({
          category: trend.category,
          text:
            trend.category === 'shopping'
              ? say('Pause shopping for a week. Last week it cost {amount}.', { amount: fmt(week) })
              : say('Pause entertainment for a week. Last week it cost {amount}.', { amount: fmt(week) }),
          saving: week,
        });
    }
  }
  return tips.sort((a, b) => b.saving - a.saving).slice(0, 3);
}

export async function dailyInsight(db: Db, userId: string, date?: string): Promise<DailyInsight> {
  const [u] = await db.select({ name: users.name, language: users.language }).from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  const [plan, currency] = await Promise.all([monthPlan(db, userId, date), userCurrency(db, userId)]);
  return buildDailyInsight(u.name, plan, currency, u.language);
}
