// Family budget (one manager, members join with a code). The Family Guard below is plain code, like Policy Guard:
// checks run in order and the first failure wins; the language model never decides.
import { convertMoney, formatMoney, type Category, type Currency, type FamilyOverview, type FamilyRequest, type FamilyRole } from '@femate/shared';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import type { Db } from '../db/client';
import { families, familyMembers, familyRequests, transactions, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { dayStart, tashkentDate } from '../lib/time';

export type FamilyRow = typeof families.$inferSelect;
type RequestRow = typeof familyRequests.$inferSelect;

/** Requests wait this long for the manager; an approved card permission is good for this long after approval. */
export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export interface Membership {
  family: FamilyRow;
  role: FamilyRole;
}

export async function membershipOf(db: Db, userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ family: families, role: familyMembers.role })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(eq(familyMembers.userId, userId));
  return row ?? null;
}

export async function requireMembership(db: Db, userId: string): Promise<Membership> {
  const m = await membershipOf(db, userId);
  if (!m) throw new ApiError(409, 'NOT_IN_FAMILY', 'You are not in a family yet. Create one or join with a code.');
  return m;
}

export async function requireManager(db: Db, userId: string): Promise<FamilyRow> {
  const m = await requireMembership(db, userId);
  if (m.role !== 'manager') throw new ApiError(403, 'FAMILY_MANAGER_ONLY', 'Only the family manager can do that.');
  return m.family;
}

const monthStart = () => dayStart(`${tashkentDate().slice(0, 8)}01`);

/**
 * This month's family spend per member, in the family's currency. Each member's transactions are stored in
 * their own currency, so totals are converted member by member.
 */
export async function memberSpend(db: Db, family: FamilyRow): Promise<Map<string, number>> {
  const rows = await db
    .select({
      userId: transactions.userId,
      currency: users.currency,
      total: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(and(eq(transactions.familyId, family.id), eq(transactions.direction, 'out'), gte(transactions.occurredAt, monthStart())))
    .groupBy(transactions.userId, users.currency);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.userId, (out.get(r.userId) ?? 0) + convertMoney(Number(r.total), r.currency, family.currency));
  return out;
}

export async function familySpent(db: Db, family: FamilyRow): Promise<number> {
  let sum = 0;
  for (const v of (await memberSpend(db, family)).values()) sum += v;
  return sum;
}

export type GuardResult =
  | { result: 'allow'; family: FamilyRow; role: FamilyRole; amount: number }
  | { result: 'approval'; family: FamilyRow; role: FamilyRole; amount: number; message: string }
  | { result: 'block'; family: FamilyRow | null; code: 'NOT_IN_FAMILY' | 'INVALID_ARGS' | 'FAMILY_BUDGET_EXCEEDED'; message: string };

/**
 * Family Guard. `amount` is in the spender's own currency; the result's amount is in the family's.
 * `approved` skips check 4 (the manager already said yes).
 */
export async function checkFamilySpend(db: Db, userId: string, amount: number, opts: { approved?: boolean } = {}): Promise<GuardResult> {
  // 1. Membership
  const m = await membershipOf(db, userId);
  if (!m) return { result: 'block', family: null, code: 'NOT_IN_FAMILY', message: 'You are not in a family, so this can’t be paid from a family budget.' };
  const { family, role } = m;
  const fmt = (n: number) => formatMoney(n, family.currency);
  // 2. Amount
  const own = await userCurrency(db, userId);
  const famAmount = convertMoney(amount, own, family.currency);
  if (!Number.isInteger(famAmount) || famAmount <= 0) return { result: 'block', family, code: 'INVALID_ARGS', message: 'That amount is too small.' };
  // 3. Budget: a spend that would pass the monthly family budget is blocked
  const spent = await familySpent(db, family);
  if (spent + famAmount > family.monthlyBudget) {
    const left = Math.max(0, family.monthlyBudget - spent);
    return {
      result: 'block',
      family,
      code: 'FAMILY_BUDGET_EXCEEDED',
      message: `${fmt(famAmount)} is more than the ${fmt(left)} left in the ${family.name} budget this month.`,
    };
  }
  // 4. Approval limit: a member's spend above it waits for the manager
  if (!opts.approved && role === 'member' && famAmount > family.approvalThreshold) {
    return {
      result: 'approval',
      family,
      role,
      amount: famAmount,
      message: `${fmt(famAmount)} is over the ${fmt(family.approvalThreshold)} approval limit, so it needs the manager’s OK.`,
    };
  }
  // 5. Allowed
  return { result: 'allow', family, role, amount: famAmount };
}

/** Pending requests past their time become expired; approved card permissions too. */
export async function expireRequests(db: Db, familyId: string) {
  await db
    .update(familyRequests)
    .set({ status: 'expired' })
    .where(and(eq(familyRequests.familyId, familyId), inArray(familyRequests.status, ['pending', 'approved']), lt(familyRequests.expiresAt, new Date())));
}

export function toFamilyRequest(r: RequestRow, memberName: string, viewerId: string): FamilyRequest {
  return {
    id: r.id,
    kind: r.kind,
    amount: r.amount,
    category: r.category,
    description: r.description,
    status: r.status,
    memberName,
    mine: r.userId === viewerId,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    ...(r.decidedAt ? { decidedAt: r.decidedAt.toISOString() } : {}),
  };
}

export async function overview(db: Db, userId: string): Promise<FamilyOverview | null> {
  const m = await membershipOf(db, userId);
  if (!m) return null;
  const { family, role } = m;
  await expireRequests(db, family.id);
  const people = await db
    .select({ userId: familyMembers.userId, role: familyMembers.role, joinedAt: familyMembers.joinedAt, name: users.name })
    .from(familyMembers)
    .innerJoin(users, eq(users.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, family.id))
    .orderBy(familyMembers.joinedAt);
  const spendBy = await memberSpend(db, family);
  let spent = 0;
  for (const v of spendBy.values()) spent += v;
  const names = new Map(people.map((p) => [p.userId, p.name]));
  const manager = people.find((p) => p.role === 'manager');

  const reqRows = await db
    .select({ r: familyRequests, name: users.name })
    .from(familyRequests)
    .innerJoin(users, eq(users.id, familyRequests.userId))
    .where(and(eq(familyRequests.familyId, family.id), role === 'manager' ? undefined : eq(familyRequests.userId, userId)))
    .orderBy(desc(familyRequests.createdAt))
    .limit(30);

  return {
    family: {
      id: family.id,
      name: family.name,
      currency: family.currency,
      monthlyBudget: family.monthlyBudget,
      approvalThreshold: family.approvalThreshold,
      managerName: manager?.name ?? names.get(family.managerId) ?? '',
      createdAt: family.createdAt.toISOString(),
    },
    role,
    budget: { limit: family.monthlyBudget, spent, remaining: Math.max(0, family.monthlyBudget - spent) },
    memberCount: people.length,
    ...(role === 'manager'
      ? {
          members: people.map((p) => ({
            userId: p.userId,
            name: p.name,
            role: p.role,
            spent: spendBy.get(p.userId) ?? 0,
            joinedAt: p.joinedAt.toISOString(),
          })),
        }
      : {}),
    requests: reqRows.map(({ r, name }) => toFamilyRequest(r, name, userId)),
  };
}

/** Audit a family decision in the spender's log and, when someone else manages the family, in the manager's too. */
export async function auditFamily(
  db: Db,
  family: FamilyRow,
  userId: string,
  e: { event: string; decision: 'allowed' | 'blocked' | 'info'; reason: string; details?: Record<string, unknown> },
  actor: 'user' | 'system' = 'user',
) {
  const entry = { actor, event: e.event, decision: e.decision, reason: e.reason, details: { familyId: family.id, ...e.details } } as const;
  await audit(db, userId, entry);
  if (family.managerId !== userId) await audit(db, family.managerId, entry);
}

export interface FamilyExpenseInput {
  amount: number;
  currency?: Currency | null;
  category: Category;
  description: string;
}
