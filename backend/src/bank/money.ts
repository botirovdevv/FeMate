// Money the user moves themselves (not the agent): top-ups and income, moves between their own
// accounts (ATM withdrawal, savings → card) and balance corrections. Every row is a 'transfer', so
// none of it counts as spending; the agent's own transfers stay in mockBank.transferToSavings.
import { formatMoney } from '@femate/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { audit } from '../audit/audit';
import type { Db } from '../db/client';
import { accounts, transactions } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { userCurrency } from './currency';
import { msg, t } from '../i18n';
import { userLang } from '../i18n/user';

type AccountType = 'card' | 'savings' | 'cash';
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Stored on the transaction in the user's language.
const DEPOSIT_TEXT: Record<AccountType, string> = { card: msg('Card top-up'), cash: msg('Cash received'), savings: msg('Added to Savings') };

const MOVE_TEXT: Record<string, string> = {
  'card>cash': msg('ATM withdrawal'),
  'card>savings': msg('Moved to Savings'),
  'cash>card': msg('Cash deposited to card'),
  'cash>savings': msg('Cash put into Savings'),
  'savings>card': msg('From Savings to card'),
  'savings>cash': msg('Cash taken from Savings'),
};

async function own(tx: Tx, userId: string, type: AccountType) {
  const [a] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.type, type)));
  if (!a) throw new ApiError(409, 'BANK_NOT_CONNECTED', 'Connect the sandbox bank first.');
  return a;
}

async function record(tx: Tx, userId: string, accountId: string, amount: number, direction: 'in' | 'out', description: string) {
  const [row] = await tx
    .insert(transactions)
    .values({ id: newId('tx'), userId, accountId, amount, direction, category: 'transfer', description, source: 'manual', occurredAt: new Date() })
    .returning();
  return row!;
}

/** Money coming in from outside. In the sandbox a card top-up is simulated: no real card is charged. */
export async function deposit(db: Db, userId: string, to: AccountType, amount: number, description?: string) {
  const lang = await userLang(db, userId);
  const row = await db.transaction(async (tx) => {
    const acc = await own(tx, userId, to);
    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}` })
      .where(eq(accounts.id, acc.id));
    return record(tx, userId, acc.id, amount, 'in', description?.trim() || t(DEPOSIT_TEXT[to], undefined, lang));
  });
  await audit(db, userId, {
    actor: 'user',
    event: 'money.deposit',
    decision: 'info',
    // Account types as keys: msg('card') msg('cash') msg('savings')
    reason: { key: '{what}: +{amount} to {account}.', params: { what: row.description, amount: formatMoney(amount, await userCurrency(db, userId)), account: to } },
  });
  return row;
}

/** Between the user's own accounts; never lets the source go below zero. Recorded once, on the source account. */
export async function moveMoney(db: Db, userId: string, from: AccountType, to: AccountType, amount: number) {
  const lang = await userLang(db, userId);
  if (from === to) throw new ApiError(400, 'INVALID_ARGS', 'Pick two different accounts.');
  const row = await db.transaction(async (tx) => {
    const src = await own(tx, userId, from);
    const dst = await own(tx, userId, to);
    const debited = await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${amount}` })
      .where(and(eq(accounts.id, src.id), gte(accounts.balance, amount)))
      .returning({ id: accounts.id });
    if (debited.length === 0) throw new ApiError(409, 'INSUFFICIENT_FUNDS', 'There isn’t enough in {account}.', { account: src.name });
    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}` })
      .where(eq(accounts.id, dst.id));
    return record(tx, userId, src.id, amount, 'out', t(MOVE_TEXT[`${from}>${to}`]!, undefined, lang));
  });
  await audit(db, userId, {
    actor: 'user',
    event: 'money.transfer',
    decision: 'info',
    reason: { key: '{what}: {amount} from {from} to {to}.', params: { what: row.description, amount: formatMoney(amount, await userCurrency(db, userId)), from, to } },
  });
  return row;
}

/**
 * Sets an account to what the user really has. The difference is recorded so the history still adds up:
 * "Starting balance" while the account has no history yet, "Balance correction" after that.
 */
export async function setBalance(db: Db, userId: string, type: AccountType, balance: number) {
  const lang = await userLang(db, userId);
  const row = await db.transaction(async (tx) => {
    const acc = await own(tx, userId, type);
    const delta = balance - acc.balance;
    if (delta === 0) return null;
    const [any] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.accountId, acc.id)).limit(1);
    await tx.update(accounts).set({ balance }).where(eq(accounts.id, acc.id));
    return record(tx, userId, acc.id, Math.abs(delta), delta > 0 ? 'in' : 'out', t(any ? 'Balance correction' : 'Starting balance', undefined, lang));
  });
  if (row) {
    await audit(db, userId, {
      actor: 'user',
      event: 'money.balance',
      decision: 'info',
      reason: { key: '{what}: {account} set to {amount}.', params: { what: row.description, account: type, amount: formatMoney(balance, await userCurrency(db, userId)) } },
    });
  }
  return row;
}
