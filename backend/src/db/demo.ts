// Demo user from PLAN.md §7: aziz@femate.uz / demo1234, L2 Co-pilot, 14 days of sandbox history.
import bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';

import { audit } from '../audit/audit';
import { openSandboxAccounts, seedDemoHistory } from '../bank/mockBank';
import type { Db } from './client';
import { newId } from '../lib/ids';
import { dayStart, tashkentDate } from '../lib/time';
import { accounts, families, familyMembers, permissions, transactions, users } from './schema';

export const DEMO = { id: 'usr_aziz', email: 'aziz@femate.uz', password: 'demo1234' };
/** Aziz manages the demo family; Malika is a member with a few family spends this month. */
export const DEMO_MEMBER = { id: 'usr_malika', email: 'malika@femate.uz', password: 'demo1234' };
export const DEMO_FAMILY = { id: 'fam_aziz', name: 'Aziz’s family', monthlyBudget: 3_000_000, approvalThreshold: 200_000 };

export async function demoExists(db: Db) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, DEMO.id));
  return Boolean(u);
}

/** Deletes the demo users (everything cascades) and creates them again from scratch. */
export async function resetDemo(db: Db) {
  await db.delete(users).where(inArray(users.id, [DEMO.id, DEMO_MEMBER.id]));
  await db.insert(users).values({
    id: DEMO.id,
    email: DEMO.email,
    passwordHash: await bcrypt.hash(DEMO.password, 10),
    name: 'Aziz',
    monthlyIncome: 4_000_000,
    fixedCostsMonthly: 600_000,
    savingsGoalMonthly: 500_000,
  });
  await db.insert(permissions).values({
    userId: DEMO.id,
    level: 'L2',
    scopes: ['read_balance', 'read_transactions', 'transfer_own'],
    perActionLimit: 100_000,
    dailyLimit: 300_000,
    agentEnabled: true,
  });
  const ids = { card: 'acc_aziz_card', savings: 'acc_aziz_savings', cash: 'acc_aziz_cash' };
  await openSandboxAccounts(db, DEMO.id, ids);
  await seedDemoHistory(db, DEMO.id, ids);
  await audit(db, DEMO.id, {
    actor: 'user',
    event: 'bank.connect',
    decision: 'info',
    reason: 'Sandbox Bank connected at L2 with read_balance, read_transactions, transfer_own.',
    level: 'L2',
  });
  await seedDemoFamily(db);
}

async function seedDemoFamily(db: Db) {
  await db.insert(users).values({
    id: DEMO_MEMBER.id,
    email: DEMO_MEMBER.email,
    passwordHash: await bcrypt.hash(DEMO_MEMBER.password, 10),
    name: 'Malika',
    monthlyIncome: 2_500_000,
    fixedCostsMonthly: 300_000,
    savingsGoalMonthly: 200_000,
  });
  await db.insert(permissions).values({ userId: DEMO_MEMBER.id, level: 'L1', scopes: ['read_balance', 'read_transactions'], agentEnabled: true });
  const ids = { card: 'acc_malika_card', savings: 'acc_malika_savings', cash: 'acc_malika_cash' };
  await openSandboxAccounts(db, DEMO_MEMBER.id, ids);
  await db.update(accounts).set({ balance: 900_000 }).where(eq(accounts.id, ids.card));
  await db.update(accounts).set({ balance: 120_000 }).where(eq(accounts.id, ids.cash));
  await db.insert(families).values({ ...DEMO_FAMILY, managerId: DEMO.id, currency: 'UZS' });
  await db.insert(familyMembers).values([
    { familyId: DEMO_FAMILY.id, userId: DEMO.id, role: 'manager' },
    { familyId: DEMO_FAMILY.id, userId: DEMO_MEMBER.id, role: 'member' },
  ]);
  // Family spends earlier today, so they always fall in the current month.
  const at = (hoursAgo: number) => new Date(Math.max(dayStart(tashkentDate()).getTime(), Date.now() - hoursAgo * 3_600_000));
  const spends: [number, 'food' | 'utilities' | 'education', string, number][] = [
    [185_000, 'food', 'Korzinka groceries', 3],
    [120_000, 'utilities', 'Electricity', 2],
    [90_000, 'education', 'English course books', 1],
  ];
  for (const [amount, category, description, hoursAgo] of spends) {
    await db.insert(transactions).values({
      id: newId('tx'),
      userId: DEMO_MEMBER.id,
      accountId: ids.card,
      amount,
      direction: 'out',
      category,
      description,
      source: 'manual',
      familyId: DEMO_FAMILY.id,
      occurredAt: at(hoursAgo),
    });
  }
}
