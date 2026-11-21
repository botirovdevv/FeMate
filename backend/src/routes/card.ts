import { convertMoney, type CardAuthorization, type CardDetails, type CardStatus, type PaymentCard, type SimulatePurchaseResponse } from '@femate/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { decideAuthorization, issueCard, networkName, userCard } from '../card/cards';
import type { CardIssuer } from '../card/lithic';
import { cardAuthorizations, cards } from '../db/schema';
import { membershipOf } from '../family/family';
import { ApiError } from '../lib/errors';
import { newId } from '../lib/ids';
import { toCardAuthorization, toPaymentCard } from '../lib/serialize';
import { amountSchema, parse } from '../lib/validate';
import { msg, t } from '../i18n';
import { userLang } from '../i18n/user';

const patchBody = z.object({ frozen: z.boolean().optional(), blockOverBudget: z.boolean().optional(), payFromFamily: z.boolean().optional() });
const simulateBody = z.object({
  amount: amountSchema,
  merchant: z.string().trim().min(1).max(40),
  mcc: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
});

export async function cardRoutes(app: FastifyInstance) {
  const { db } = app;

  const issuer = (): CardIssuer => {
    if (!app.cards) throw new ApiError(503, 'CARD_UNAVAILABLE', 'The FeMate card isn’t switched on on this server yet.');
    return app.cards;
  };
  const myCard = async (userId: string) => {
    const c = await userCard(db, userId);
    if (!c) throw new ApiError(404, 'NO_CARD', 'You don’t have a FeMate card yet.');
    return c;
  };

  app.get('/card', async (req): Promise<CardStatus> => {
    const c = await userCard(db, req.userId);
    return { available: app.cards !== null, sandbox: app.cards?.sandbox ?? true, card: c ? toPaymentCard(c) : null };
  });

  app.post('/card', async (req, reply): Promise<PaymentCard> => {
    const c = await issueCard(db, issuer(), req.userId);
    reply.status(201);
    return toPaymentCard(c);
  });

  // The full number is fetched from Lithic each time and never stored; every reveal is audited.
  app.get('/card/details', async (req): Promise<CardDetails> => {
    const c = await myCard(req.userId);
    const d = await issuer().cardDetails(c.lithicToken);
    await audit(db, req.userId, { actor: 'user', event: 'card.reveal', decision: 'info', reason: { key: 'Card ·· {last4} number shown in the app.', params: { last4: c.lastFour } } });
    return d;
  });

  app.patch('/card', async (req): Promise<PaymentCard> => {
    const b = parse(patchBody, req.body);
    const c = await myCard(req.userId);
    if (b.payFromFamily && !(await membershipOf(db, req.userId))) {
      throw new ApiError(409, 'NOT_IN_FAMILY', 'Join or create a family before paying from a family budget.');
    }
    if (b.frozen !== undefined && b.frozen !== c.frozen) await issuer().setPaused(c.lithicToken, b.frozen);
    const [row] = await db
      .update(cards)
      .set({
        ...(b.frozen !== undefined ? { frozen: b.frozen } : {}),
        ...(b.blockOverBudget !== undefined ? { blockOverBudget: b.blockOverBudget } : {}),
        ...(b.payFromFamily !== undefined ? { payFromFamily: b.payFromFamily } : {}),
      })
      .where(eq(cards.id, c.id))
      .returning();
    const changes = [
      b.frozen !== undefined && b.frozen !== c.frozen ? (b.frozen ? msg('frozen') : msg('unfrozen')) : null,
      b.blockOverBudget !== undefined && b.blockOverBudget !== c.blockOverBudget
        ? b.blockOverBudget
          ? msg('over-budget purchases blocked')
          : msg('over-budget purchases allowed')
        : null,
      b.payFromFamily !== undefined && b.payFromFamily !== c.payFromFamily
        ? b.payFromFamily
          ? msg('purchases paid from the family budget')
          : msg('purchases paid from the personal budget')
        : null,
    ].filter((x): x is string => Boolean(x));
    if (changes.length) {
      const lang = await userLang(db, req.userId);
      await audit(db, req.userId, {
        actor: 'user',
        event: 'card.update',
        decision: 'info',
        reason: `${networkName(c.network)} ·· ${c.lastFour}: ${changes.map((x) => t(x, undefined, lang)).join(', ')}.`,
      });
    }
    return toPaymentCard(row!);
  });

  app.get('/card/authorizations', async (req): Promise<CardAuthorization[]> => {
    const rows = await db
      .select()
      .from(cardAuthorizations)
      .where(eq(cardAuthorizations.userId, req.userId))
      .orderBy(desc(cardAuthorizations.createdAt))
      .limit(20);
    return rows.map(toCardAuthorization);
  });

  // Sandbox only: a purchase as if a merchant charged the card. Lithic asks our ASA endpoint, which decides;
  // we then read back that decision. A frozen card is declined by Lithic before ASA, so it's decided here.
  app.post('/card/simulate', async (req, reply): Promise<SimulatePurchaseResponse> => {
    const cardIssuer = issuer();
    if (!cardIssuer.sandbox) throw new ApiError(403, 'SANDBOX_ONLY', 'Test purchases only work with a sandbox card.');
    const b = parse(simulateBody, req.body);
    const c = await myCard(req.userId);
    const cents = convertMoney(b.amount, await userCurrency(db, req.userId), 'USD');
    if (cents < 1) throw new ApiError(400, 'INVALID_ARGS', 'That amount is too small for a card purchase.');
    const asa = { status: 'AUTHORIZATION', card: { token: c.lithicToken }, amounts: { cardholder: { amount: cents, currency: 'USD' } } };
    const merchant = { descriptor: b.merchant.toUpperCase(), ...(b.mcc ? { mcc: b.mcc } : {}) };
    let auth;
    if (c.frozen) {
      auth = (await decideAuthorization(db, { ...asa, token: newId('sim'), merchant })).authorization;
    } else {
      const { pan } = await cardIssuer.cardDetails(c.lithicToken);
      const token = await cardIssuer.simulatePurchase({ pan, amountCents: cents, descriptor: merchant.descriptor, mcc: b.mcc });
      auth = await waitForDecision(token);
    }
    if (!auth) {
      throw new ApiError(
        502,
        'ASA_NOT_ENROLLED',
        'The card network didn’t ask FeMate about this purchase. The server’s card setup isn’t finished (scripts/lithic-setup.ts).',
      );
    }
    reply.status(201);
    return { authorization: toCardAuthorization(auth) };
  });

  // ASA runs while Lithic handles the simulated purchase; allow a little slack for the round trip.
  async function waitForDecision(token: string) {
    for (let i = 0; i < 20; i++) {
      const [a] = await db.select().from(cardAuthorizations).where(eq(cardAuthorizations.lithicToken, token));
      if (a) return a;
      await new Promise((r) => setTimeout(r, 250));
    }
    return undefined;
  }
}
