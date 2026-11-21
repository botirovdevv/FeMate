import type {
  AuditEntry,
  CardAuthorization,
  FamilyInvite,
  FamilyOverview,
  FamilyRequest,
  Page,
  PaymentCard,
  PendingFamilySpend,
  SimulatePurchaseResponse,
  Transaction,
} from '@femate/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import type { CardIssuer } from '../src/card/lithic';
import { DEMO_FAMILY, DEMO_MEMBER } from '../src/db/demo';
import { familyRequests } from '../src/db/schema';
import { setup } from './helpers';

let t: Awaited<ReturnType<typeof setup>>;
afterEach(async () => {
  await t?.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A caller signed in as someone other than Aziz. */
async function signIn(email: string, password: string) {
  const res = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  const token = res.json<{ token: string }>().token;
  return async <T = unknown>(method: Method, url: string, payload?: unknown) => {
    const r = await t.app.inject({ method, url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
    return { status: r.statusCode, body: r.json<T>() };
  };
}

async function register(name: string, email: string) {
  await t.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { name, email, password: 'secret123' } });
  return signIn(email, 'secret123');
}

const aziz = <T = unknown>(method: Method, url: string, payload?: unknown) => t.call<T>(method as 'GET', url, payload);
const malika = () => signIn(DEMO_MEMBER.email, DEMO_MEMBER.password);

// Malika's demo family spends this month: 185k + 120k + 90k.
const SEEDED = 395_000;

describe('family overview', () => {
  it('shows the manager every member, a member only the totals', async () => {
    t = await setup();
    const m = await aziz<FamilyOverview>('GET', '/family');
    expect(m.status).toBe(200);
    expect(m.body.role).toBe('manager');
    expect(m.body.family.name).toBe(DEMO_FAMILY.name);
    expect(m.body.budget).toEqual({ limit: DEMO_FAMILY.monthlyBudget, spent: SEEDED, remaining: DEMO_FAMILY.monthlyBudget - SEEDED });
    expect(m.body.members?.map((x) => [x.name, x.spent])).toEqual([
      ['Aziz', 0],
      ['Malika', SEEDED],
    ]);

    const as = await malika();
    const o = await as<FamilyOverview>('GET', '/family');
    expect(o.body.role).toBe('member');
    expect(o.body.budget.spent).toBe(SEEDED);
    expect(o.body.members).toBeUndefined();
    expect(o.body.memberCount).toBe(2);
    expect(o.body.family.managerName).toBe('Aziz');
  });

  it('is null for someone without a family', async () => {
    t = await setup();
    const as = await register('Bek', 'bek@example.com');
    const r = await as<FamilyOverview | null>('GET', '/family');
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
  });
});

describe('creating and joining', () => {
  it('creates a family, invites with a one-time code, and keeps one family per person', async () => {
    t = await setup();
    const bek = await register('Bek', 'bek@example.com');
    const created = await bek<FamilyOverview>('POST', '/family', { name: 'Bek family', monthlyBudget: 1_000_000, approvalThreshold: 50_000 });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('manager');
    expect(created.body.family.currency).toBe('UZS');

    // Already managing one
    expect((await bek('POST', '/family', { name: 'Again', monthlyBudget: 1, approvalThreshold: 0 })).status).toBe(409);
    // Aziz is already in a family, so he can't join another
    const invite = await bek<FamilyInvite>('POST', '/family/invites');
    expect(invite.status).toBe(201);
    expect(invite.body.code).toMatch(/^[A-Z2-9]{6}$/);
    const azizJoin = await aziz<{ error: { code: string } }>('POST', '/family/join', { code: invite.body.code });
    expect(azizJoin.body.error.code).toBe('ALREADY_IN_FAMILY');

    const sara = await register('Sara', 'sara@example.com');
    const joined = await sara<FamilyOverview>('POST', '/family/join', { code: invite.body.code.toLowerCase() });
    expect(joined.status).toBe(200);
    expect(joined.body.role).toBe('member');
    expect(joined.body.memberCount).toBe(2);

    // The code works once
    const tom = await register('Tom', 'tom@example.com');
    const reused = await tom<{ error: { code: string } }>('POST', '/family/join', { code: invite.body.code });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('INVALID_CODE');
  });

  it('only the manager invites, edits and removes; a member can leave', async () => {
    t = await setup();
    const as = await malika();
    expect((await as('POST', '/family/invites')).status).toBe(403);
    expect((await as('PATCH', '/family', { monthlyBudget: 9_000_000 })).status).toBe(403);
    expect((await aziz('POST', '/family/leave')).status).toBe(409);

    const edited = await aziz<FamilyOverview>('PATCH', '/family', { approvalThreshold: 300_000 });
    expect(edited.body.family.approvalThreshold).toBe(300_000);

    const removed = await aziz<FamilyOverview>('DELETE', `/family/members/${DEMO_MEMBER.id}`);
    expect(removed.body.memberCount).toBe(1);
    expect((await as<FamilyOverview | null>('GET', '/family')).body).toBeNull();
  });

  it('deleting the family keeps the spending history', async () => {
    t = await setup();
    expect((await aziz('DELETE', '/family')).status).toBe(200);
    expect((await aziz<FamilyOverview | null>('GET', '/family')).body).toBeNull();
    const as = await malika();
    const txs = await as<Page<Transaction>>('GET', '/transactions');
    expect(txs.body.items.filter((x) => x.description === 'Electricity')).toHaveLength(1);
    expect(txs.body.items.every((x) => x.familyId === undefined)).toBe(true);
  });
});

describe('Family Guard', () => {
  it('records a family spend under the approval limit', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<Transaction>('POST', '/transactions', { amount: 50_000, category: 'food', description: 'Bread and milk', family: true });
    expect(r.status).toBe(201);
    expect(r.body.familyId).toBe(DEMO_FAMILY.id);
    const o = await as<FamilyOverview>('GET', '/family');
    expect(o.body.budget.spent).toBe(SEEDED + 50_000);
  });

  it('a personal expense does not touch the family budget', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<Transaction>('POST', '/transactions', { amount: 500_000, category: 'shopping', description: 'Shoes' });
    expect(r.status).toBe(201);
    expect(r.body.familyId).toBeUndefined();
    expect((await as<FamilyOverview>('GET', '/family')).body.budget.spent).toBe(SEEDED);
  });

  it('sends a spend over the limit to the manager, who approves it', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<PendingFamilySpend>('POST', '/transactions', { amount: 450_000, category: 'education', description: 'School fee', family: true });
    expect(r.status).toBe(202);
    expect(r.body.pending).toMatchObject({ kind: 'expense', amount: 450_000, status: 'pending', mine: true });
    // Nothing is recorded yet
    expect((await as<FamilyOverview>('GET', '/family')).body.budget.spent).toBe(SEEDED);

    const queue = await aziz<FamilyOverview>('GET', '/family');
    const req = queue.body.requests.find((x) => x.id === r.body.pending.id);
    expect(req).toMatchObject({ memberName: 'Malika', status: 'pending', mine: false });

    // A member can't decide
    expect((await as('POST', `/family/requests/${r.body.pending.id}/approve`)).status).toBe(403);
    const ok = await aziz<FamilyRequest>('POST', `/family/requests/${r.body.pending.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('used');
    expect((await as<FamilyOverview>('GET', '/family')).body.budget.spent).toBe(SEEDED + 450_000);
    const txs = await as<Page<Transaction>>('GET', '/transactions');
    expect(txs.body.items.find((x) => x.description === 'School fee')?.familyId).toBe(DEMO_FAMILY.id);
    // Decided once
    expect((await aziz('POST', `/family/requests/${r.body.pending.id}/approve`)).status).toBe(409);

    const log = await as<Page<AuditEntry>>('GET', '/audit');
    expect(log.body.items.some((e) => e.event === 'family.approve' && e.decision === 'allowed')).toBe(true);
  });

  it('a rejected request records nothing', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<PendingFamilySpend>('POST', '/transactions', { amount: 300_000, category: 'shopping', description: 'Tablet case', family: true });
    const no = await aziz<FamilyRequest>('POST', `/family/requests/${r.body.pending.id}/reject`);
    expect(no.body.status).toBe('rejected');
    expect((await as<FamilyOverview>('GET', '/family')).body.budget.spent).toBe(SEEDED);
  });

  it('the manager spends without approval', async () => {
    t = await setup();
    const r = await aziz<Transaction>('POST', '/transactions', { amount: 600_000, category: 'utilities', description: 'Gas bill', family: true });
    expect(r.status).toBe(201);
    expect(r.body.familyId).toBe(DEMO_FAMILY.id);
  });

  it('blocks a spend past the monthly budget, for the manager too', async () => {
    t = await setup();
    const left = DEMO_FAMILY.monthlyBudget - SEEDED;
    const over = await aziz<{ error: { code: string; message: string } }>('POST', '/transactions', {
      amount: left + 1,
      category: 'shopping',
      description: 'Sofa',
      family: true,
    });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('FAMILY_BUDGET_EXCEEDED');
    const exact = await aziz('POST', '/transactions', { amount: left, category: 'shopping', description: 'Sofa', family: true });
    expect(exact.status).toBe(201);
    const log = await aziz<Page<AuditEntry>>('GET', '/audit');
    expect(log.body.items.some((e) => e.event === 'family.spend' && e.decision === 'blocked')).toBe(true);
  });

  it('re-checks the budget on approval', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<PendingFamilySpend>('POST', '/transactions', { amount: 400_000, category: 'education', description: 'Laptop', family: true });
    // Meanwhile the manager spends almost all that is left
    const left = DEMO_FAMILY.monthlyBudget - SEEDED;
    expect((await aziz('POST', '/transactions', { amount: left - 100_000, category: 'utilities', description: 'Rent share', family: true })).status).toBe(201);
    const late = await aziz<{ error: { code: string } }>('POST', `/family/requests/${r.body.pending.id}/approve`);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('FAMILY_BUDGET_EXCEEDED');
  });

  it('expires requests the manager never answered', async () => {
    t = await setup();
    const as = await malika();
    const r = await as<PendingFamilySpend>('POST', '/transactions', { amount: 250_000, category: 'food', description: 'Party', family: true });
    await t.db.update(familyRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(familyRequests.id, r.body.pending.id));
    const o = await aziz<FamilyOverview>('GET', '/family');
    expect(o.body.requests.find((x) => x.id === r.body.pending.id)?.status).toBe('expired');
    expect((await aziz('POST', `/family/requests/${r.body.pending.id}/approve`)).status).toBe(409);
  });

  it('a family spend without a family is refused', async () => {
    t = await setup();
    const bek = await register('Bek', 'bek@example.com');
    await bek('POST', '/bank/connect', { level: 'L1', scopes: ['read_balance', 'read_transactions'] });
    const r = await bek<{ error: { code: string } }>('POST', '/transactions', { amount: 10_000, category: 'food', description: 'Tea', family: true });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('NOT_IN_FAMILY');
  });
});

describe('family card', () => {
  /** Lithic stand-in for Malika's card; simulated purchases call our ASA endpoint. */
  async function malikaCard() {
    let n = 0;
    const issuer: CardIssuer = {
      sandbox: true,
      async createCard() {
        return { token: 'lith_card_m', lastFour: '7777', expMonth: '06', expYear: '2031', network: 'VISA' };
      },
      async cardDetails() {
        return { pan: '4111111111117777', cvv: '123', expMonth: '06', expYear: '2031' };
      },
      async setPaused() {},
      async simulatePurchase({ amountCents, descriptor, mcc }) {
        const token = `lith_tx_${++n}`;
        await t.app.inject({
          method: 'POST',
          url: '/api/v1/lithic/asa',
          payload: {
            token,
            status: 'AUTHORIZATION',
            card: { token: 'lith_card_m' },
            amounts: { cardholder: { amount: amountCents, currency: 'USD' } },
            merchant: { descriptor, mcc: mcc ?? '5411' },
          },
        });
        return token;
      },
    };
    t = await setup({ cards: issuer });
    const as = await malika();
    expect((await as<PaymentCard>('POST', '/card')).status).toBe(201);
    const on = await as<PaymentCard>('PATCH', '/card', { payFromFamily: true });
    expect(on.body.payFromFamily).toBe(true);
    const buy = (amount: number, merchant = 'KORZINKA') => as<SimulatePurchaseResponse>('POST', '/card/simulate', { amount, merchant, mcc: '5411' });
    return { as, buy };
  }

  it('pays small purchases from the family budget', async () => {
    const { as, buy } = await malikaCard();
    const r = await buy(100_000);
    expect(r.body.authorization.approved).toBe(true);
    const o = await as<FamilyOverview>('GET', '/family');
    expect(o.body.budget.spent).toBeGreaterThan(SEEDED + 90_000);
  });

  it('declines a purchase over the limit until the manager allows it in advance', async () => {
    const { as, buy } = await malikaCard();
    const first = await buy(500_000);
    expect(first.body.authorization.approved).toBe(false);
    expect(first.body.authorization.reason).toMatch(/approval/i);

    const ask = await as<FamilyRequest>('POST', '/family/requests', { amount: 600_000, description: 'Winter coat' });
    expect(ask.status).toBe(201);
    const ok = await aziz<FamilyRequest>('POST', `/family/requests/${ask.body.id}/approve`);
    expect(ok.body.status).toBe('approved');

    const second = await buy(500_000);
    expect(second.body.authorization.approved).toBe(true);
    // The permission is used up
    const third = await buy(500_000);
    expect(third.body.authorization.approved).toBe(false);
    const auths = await as<CardAuthorization[]>('GET', '/card/authorizations');
    expect(auths.body.filter((a) => a.approved)).toHaveLength(1);
  });

  it('declines when the family budget would be passed', async () => {
    const { buy } = await malikaCard();
    await aziz('PATCH', '/family', { monthlyBudget: SEEDED + 50_000 });
    const r = await buy(100_000);
    expect(r.body.authorization.approved).toBe(false);
    expect(r.body.authorization.reason).toMatch(/left in the/);
  });

  it('turns family payment off when the member leaves', async () => {
    const { as } = await malikaCard();
    expect((await as('POST', '/family/leave')).status).toBe(200);
    const c = await as<{ card: PaymentCard }>('GET', '/card');
    expect(c.body.card.payFromFamily).toBe(false);
    expect((await as('PATCH', '/card', { payFromFamily: true })).status).toBe(409);
  });
});
