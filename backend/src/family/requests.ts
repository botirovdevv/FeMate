// Family spends and the manager's approvals. Every outcome is audited; the manager hears about new requests
// and the member about decisions (push + Telegram, when linked).
import { convertMoney, formatMoney, type FamilyRequest, type Transaction, type TransactionSource } from '@femate/shared';
import { and, eq } from 'drizzle-orm';

import { userCurrency } from '../bank/currency';
import { addExpense } from '../bank/expenses';
import type { Db } from '../db/client';
import { familyRequests, users } from '../db/schema';
import { ApiError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { toTransaction } from '../lib/serialize';
import { MAX_AMOUNT, tooLarge } from '../lib/validate';
import { render, type Msg } from '../i18n';
import { notifyUser } from '../notify/notify';
import {
  REQUEST_TTL_MS,
  auditFamily,
  checkFamilySpend,
  expireRequests,
  requireManager,
  requireMembership,
  toFamilyRequest,
  type FamilyExpenseInput,
  type FamilyRow,
} from './family';

async function userRow(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound('User');
  return u;
}

/** Push + Telegram to one person, in their own language. */
async function notify(db: Db, userId: string, title: Msg, body: Msg) {
  const u = await userRow(db, userId).catch(() => null);
  if (u) await notifyUser(u, render(title, u.language), render(body, u.language)).catch(() => undefined);
}

const blocked = (code: string, m: Msg) => new ApiError(code === 'INVALID_ARGS' ? 400 : 409, code, m.key, m.params);

/**
 * An expense the user marks "from the family budget". Records it, or (over the approval limit) sends it to the
 * manager and returns the request. A spend past the budget is blocked.
 */
export async function spendFromFamily(
  db: Db,
  userId: string,
  e: FamilyExpenseInput & { source: TransactionSource },
): Promise<{ transaction: Transaction } | { pending: FamilyRequest }> {
  const own = await userCurrency(db, userId);
  const ownAmount = e.currency && e.currency !== own ? convertMoney(e.amount, e.currency, own) : e.amount;
  if (ownAmount > MAX_AMOUNT) throw tooLarge();
  const g = await checkFamilySpend(db, userId, ownAmount);
  const what = `“${e.description}”`;
  if (g.result === 'block') {
    if (g.family) {
      await auditFamily(db, g.family, userId, {
        event: 'family.spend',
        decision: 'blocked',
        reason: { key: '{what}: {reason}', params: { what, reason: g.message } },
        details: { code: g.code },
      });
    }
    throw blocked(g.code, g.message);
  }
  const fmt = (n: number) => formatMoney(n, g.family.currency);
  if (g.result === 'approval') {
    const [r] = await db
      .insert(familyRequests)
      .values({
        id: newId('freq'),
        familyId: g.family.id,
        userId,
        kind: 'expense',
        amount: g.amount,
        category: e.category,
        description: e.description,
        status: 'pending',
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      })
      .returning();
    const me = await userRow(db, userId);
    await auditFamily(db, g.family, userId, {
      event: 'family.request',
      decision: 'info',
      reason: { key: '{name} asked to pay {amount} for {what} from the family budget. {reason}', params: { name: me.name, amount: fmt(g.amount), what, reason: g.message } },
      details: { requestId: r!.id, amount: g.amount },
    });
    await notify(
      db,
      g.family.managerId,
      { key: 'Family approval needed' },
      { key: '{name} wants to spend {amount} on {what}. Open FeMate → Family to decide.', params: { name: me.name, amount: fmt(g.amount), what } },
    );
    return { pending: toFamilyRequest(r!, me.name, userId) };
  }
  const t = await addExpense(db, userId, { ...e, familyId: g.family.id });
  await auditFamily(db, g.family, userId, {
    event: 'family.spend',
    decision: 'allowed',
    reason: { key: '{amount} for {what} paid from the {family} budget.', params: { amount: fmt(g.amount), what, family: g.family.name } },
    details: { transactionId: t.id, amount: g.amount },
  });
  return { transaction: toTransaction(t) };
}

/** A member asks in advance for a family card purchase over the approval limit. */
export async function requestCardPermission(db: Db, userId: string, b: { amount: number; description: string }): Promise<FamilyRequest> {
  const { family, role } = await requireMembership(db, userId);
  if (role === 'manager') throw new ApiError(409, 'NOT_NEEDED', 'As the manager you don’t need approval for card purchases.');
  // `amount` is in the family's currency, the one the app shows on the Family screen.
  if (b.amount <= family.approvalThreshold) {
    throw new ApiError(409, 'NOT_NEEDED', 'Purchases up to {amount} don’t need approval.', { amount: formatMoney(family.approvalThreshold, family.currency) });
  }
  const [r] = await db
    .insert(familyRequests)
    .values({
      id: newId('freq'),
      familyId: family.id,
      userId,
      kind: 'card',
      amount: b.amount,
      category: 'other',
      description: b.description,
      status: 'pending',
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    })
    .returning();
  const me = await userRow(db, userId);
  const amount = formatMoney(b.amount, family.currency);
  await auditFamily(db, family, userId, {
    event: 'family.request',
    decision: 'info',
    reason: { key: '{name} asked to pay up to {amount} by card for “{what}” from the family budget.', params: { name: me.name, amount, what: b.description } },
    details: { requestId: r!.id, amount: b.amount },
  });
  await notify(
    db,
    family.managerId,
    { key: 'Family approval needed' },
    { key: '{name} wants to pay up to {amount} by card for “{what}”. Open FeMate → Family to decide.', params: { name: me.name, amount, what: b.description } },
  );
  return toFamilyRequest(r!, me.name, userId);
}

async function pendingRequest(db: Db, family: FamilyRow, id: string) {
  await expireRequests(db, family.id);
  const [r] = await db
    .select()
    .from(familyRequests)
    .where(and(eq(familyRequests.id, id), eq(familyRequests.familyId, family.id)));
  if (!r) throw notFound('Request');
  if (r.status !== 'pending') throw new ApiError(409, 'NOT_PENDING', 'This request is already {status}.', { status: r.status });
  return r;
}

/** Manager approves. The budget is checked again, so an approval can't push the family past its budget. */
export async function approveRequest(db: Db, managerId: string, id: string): Promise<FamilyRequest> {
  const family = await requireManager(db, managerId);
  const r = await pendingRequest(db, family, id);
  const member = await userRow(db, r.userId);
  const fmt = (n: number) => formatMoney(n, family.currency);
  const own = await userCurrency(db, r.userId);
  const g = await checkFamilySpend(db, r.userId, convertMoney(r.amount, family.currency, own), { approved: true });
  if (g.result === 'block') {
    await auditFamily(
      db,
      family,
      r.userId,
      { event: 'family.approve', decision: 'blocked', reason: { key: 'Approval of “{what}”: {reason}', params: { what: r.description, reason: g.message } }, details: { requestId: r.id } },
      'system',
    );
    throw blocked(g.code, g.message);
  }
  let transactionId: string | null = null;
  if (r.kind === 'expense') {
    // Recorded in the family currency; addExpense converts to the member's own and keeps the original.
    const t = await addExpense(db, r.userId, {
      amount: r.amount,
      currency: family.currency,
      category: r.category,
      description: r.description,
      source: 'manual',
      familyId: family.id,
    });
    transactionId = t.id;
  }
  const [done] = await db
    .update(familyRequests)
    .set({
      status: r.kind === 'expense' ? 'used' : 'approved',
      transactionId,
      decidedAt: new Date(),
      // A card permission is good for a day from now.
      ...(r.kind === 'card' ? { expiresAt: new Date(Date.now() + REQUEST_TTL_MS) } : {}),
    })
    .where(and(eq(familyRequests.id, r.id), eq(familyRequests.status, 'pending')))
    .returning();
  if (!done) throw new ApiError(409, 'NOT_PENDING', 'This request was already decided.');
  const what: Msg =
    r.kind === 'expense'
      ? { key: '{amount} for “{what}” recorded', params: { amount: fmt(r.amount), what: r.description } }
      : { key: 'card purchase up to {amount} for “{what}” allowed for 24 hours', params: { amount: fmt(r.amount), what: r.description } };
  await auditFamily(db, family, r.userId, {
    event: 'family.approve',
    decision: 'allowed',
    reason: { key: 'Manager approved {name}’s request: {what}.', params: { name: member.name, what } },
    details: { requestId: r.id, transactionId },
  });
  await notify(db, r.userId, { key: 'Approved' }, { key: 'Your family request was approved: {what}.', params: { what } });
  return toFamilyRequest(done, member.name, managerId);
}

export async function rejectRequest(db: Db, managerId: string, id: string): Promise<FamilyRequest> {
  const family = await requireManager(db, managerId);
  const r = await pendingRequest(db, family, id);
  const member = await userRow(db, r.userId);
  const [done] = await db
    .update(familyRequests)
    .set({ status: 'rejected', decidedAt: new Date() })
    .where(and(eq(familyRequests.id, r.id), eq(familyRequests.status, 'pending')))
    .returning();
  if (!done) throw new ApiError(409, 'NOT_PENDING', 'This request was already decided.');
  const amount = formatMoney(r.amount, family.currency);
  await auditFamily(db, family, r.userId, {
    event: 'family.reject',
    decision: 'blocked',
    reason: { key: 'Manager declined {name}’s request: {amount} for “{what}”.', params: { name: member.name, amount, what: r.description } },
    details: { requestId: r.id },
  });
  await notify(db, r.userId, { key: 'Not approved' }, { key: 'Your family request for {amount} (“{what}”) was declined.', params: { amount, what: r.description } });
  return toFamilyRequest(done, member.name, managerId);
}
