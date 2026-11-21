// Family budget API. One manager (who created the family) sets the budget and approval limit and decides requests;
// members join with a one-time code and see only the family totals.
import { formatMoney, type FamilyInvite, type FamilyOverview, type FamilyRequest } from '@femate/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

import { audit } from '../audit/audit';
import { userCurrency } from '../bank/currency';
import { cards, families, familyInvites, familyMembers, familyRequests, transactions, users } from '../db/schema';
import { auditFamily, membershipOf, overview, requireManager, requireMembership } from '../family/family';
import { approveRequest, rejectRequest, requestCardPermission } from '../family/requests';
import { ApiError, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { MAX_AMOUNT, amountSchema, parse } from '../lib/validate';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
// No 0/O or 1/I so a code read aloud or typed from a screenshot is unambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const name = z.string().trim().min(1, 'Give the family a name.').max(60);
const threshold = z.number().int().min(0).max(MAX_AMOUNT);
const createBody = z.object({ name, monthlyBudget: amountSchema, approvalThreshold: threshold });
const updateBody = z.object({ name: name.optional(), monthlyBudget: amountSchema.optional(), approvalThreshold: threshold.optional() });
const joinBody = z.object({ code: z.string().trim().toUpperCase().length(6, 'The code has 6 characters.') });
const cardRequestBody = z.object({ amount: amountSchema, description: z.string().trim().min(1, 'Say what it’s for.').max(200) });
const idParam = z.object({ id: z.string().min(1) });
const userParam = z.object({ userId: z.string().min(1) });

export async function familyRoutes(app: FastifyInstance) {
  const { db } = app;
  // Codes are short, so guessing is rate limited like sign-in.
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  const current = async (userId: string): Promise<FamilyOverview> => {
    const o = await overview(db, userId);
    if (!o) throw new ApiError(409, 'NOT_IN_FAMILY', 'You are not in a family yet.');
    return o;
  };

  app.get('/family', async (req): Promise<FamilyOverview | null> => overview(db, req.userId));

  app.post('/family', async (req, reply): Promise<FamilyOverview> => {
    const b = parse(createBody, req.body);
    if (await membershipOf(db, req.userId)) throw new ApiError(409, 'ALREADY_IN_FAMILY', 'You are already in a family. Leave it first.');
    const currency = await userCurrency(db, req.userId);
    const id = newId('fam');
    await db.transaction(async (tx) => {
      await tx.insert(families).values({ id, name: b.name, managerId: req.userId, currency, monthlyBudget: b.monthlyBudget, approvalThreshold: b.approvalThreshold });
      await tx.insert(familyMembers).values({ familyId: id, userId: req.userId, role: 'manager' });
    });
    await audit(db, req.userId, {
      actor: 'user',
      event: 'family.create',
      decision: 'info',
      reason: `Family “${b.name}” created: ${formatMoney(b.monthlyBudget, currency)} a month, approval over ${formatMoney(b.approvalThreshold, currency)}.`,
      details: { familyId: id },
    });
    reply.status(201);
    return current(req.userId);
  });

  app.patch('/family', async (req): Promise<FamilyOverview> => {
    const b = parse(updateBody, req.body);
    const f = await requireManager(db, req.userId);
    await db.update(families).set(b).where(eq(families.id, f.id));
    const fmt = (n: number) => formatMoney(n, f.currency);
    const changes = [
      b.name !== undefined && b.name !== f.name ? `name “${b.name}”` : null,
      b.monthlyBudget !== undefined && b.monthlyBudget !== f.monthlyBudget ? `budget ${fmt(f.monthlyBudget)} → ${fmt(b.monthlyBudget)}` : null,
      b.approvalThreshold !== undefined && b.approvalThreshold !== f.approvalThreshold
        ? `approval limit ${fmt(f.approvalThreshold)} → ${fmt(b.approvalThreshold)}`
        : null,
    ].filter(Boolean);
    if (changes.length) await audit(db, req.userId, { actor: 'user', event: 'family.update', decision: 'info', reason: `Family: ${changes.join(', ')}.` });
    return current(req.userId);
  });

  app.delete('/family', async (req): Promise<{ ok: true }> => {
    const f = await requireManager(db, req.userId);
    const memberIds = (await db.select({ userId: familyMembers.userId }).from(familyMembers).where(eq(familyMembers.familyId, f.id))).map((m) => m.userId);
    await db.transaction(async (tx) => {
      // Spending history stays; it just no longer points at a family.
      await tx.update(transactions).set({ familyId: null }).where(eq(transactions.familyId, f.id));
      for (const userId of memberIds) await tx.update(cards).set({ payFromFamily: false }).where(eq(cards.userId, userId));
      await tx.delete(families).where(eq(families.id, f.id));
    });
    await audit(db, req.userId, { actor: 'user', event: 'family.delete', decision: 'info', reason: `Family “${f.name}” deleted.` });
    return { ok: true };
  });

  app.post('/family/invites', strict, async (req, reply): Promise<FamilyInvite> => {
    const f = await requireManager(db, req.userId);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    for (;;) {
      const code = newCode();
      const [row] = await db.insert(familyInvites).values({ code, familyId: f.id, expiresAt }).onConflictDoNothing().returning();
      if (row) {
        reply.status(201);
        return { code, expiresAt: expiresAt.toISOString() };
      }
    }
  });

  app.post('/family/join', strict, async (req): Promise<FamilyOverview> => {
    const b = parse(joinBody, req.body);
    if (await membershipOf(db, req.userId)) throw new ApiError(409, 'ALREADY_IN_FAMILY', 'You are already in a family. Leave it first.');
    const familyId = await db.transaction(async (tx) => {
      // Claiming the code and joining happen together, so one code admits one person.
      const [invite] = await tx
        .update(familyInvites)
        .set({ usedBy: req.userId })
        .where(and(eq(familyInvites.code, b.code), isNull(familyInvites.usedBy), gt(familyInvites.expiresAt, new Date())))
        .returning();
      if (!invite) throw new ApiError(400, 'INVALID_CODE', 'That code is wrong, already used or expired. Ask for a new one.');
      const [joined] = await tx
        .insert(familyMembers)
        .values({ familyId: invite.familyId, userId: req.userId, role: 'member' })
        .onConflictDoNothing()
        .returning();
      if (!joined) throw new ApiError(409, 'ALREADY_IN_FAMILY', 'You are already in a family. Leave it first.');
      return invite.familyId;
    });
    const [f] = await db.select().from(families).where(eq(families.id, familyId));
    const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, req.userId));
    if (f) await auditFamily(db, f, req.userId, { event: 'family.join', decision: 'info', reason: `${me?.name ?? 'A member'} joined “${f.name}”.` });
    return current(req.userId);
  });

  /** Ends a membership: open requests expire and the card stops paying from the family budget. */
  async function removeMember(familyId: string, userId: string) {
    await db.transaction(async (tx) => {
      await tx
        .update(familyRequests)
        .set({ status: 'expired' })
        .where(and(eq(familyRequests.familyId, familyId), eq(familyRequests.userId, userId), eq(familyRequests.status, 'pending')));
      await tx
        .update(familyRequests)
        .set({ status: 'expired' })
        .where(and(eq(familyRequests.familyId, familyId), eq(familyRequests.userId, userId), eq(familyRequests.status, 'approved')));
      await tx.update(cards).set({ payFromFamily: false }).where(eq(cards.userId, userId));
      await tx.delete(familyMembers).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)));
    });
  }

  app.post('/family/leave', async (req): Promise<{ ok: true }> => {
    const { family, role } = await requireMembership(db, req.userId);
    if (role === 'manager') throw new ApiError(409, 'MANAGER_CANNOT_LEAVE', 'As the manager you can’t leave. Delete the family instead.');
    await removeMember(family.id, req.userId);
    await auditFamily(db, family, req.userId, { event: 'family.leave', decision: 'info', reason: `Left “${family.name}”.` });
    return { ok: true };
  });

  app.delete('/family/members/:userId', async (req): Promise<FamilyOverview> => {
    const { userId } = parse(userParam, req.params);
    const f = await requireManager(db, req.userId);
    if (userId === req.userId) throw new ApiError(409, 'MANAGER_CANNOT_LEAVE', 'You manage this family. Delete the family instead.');
    const [m] = await db
      .select({ name: users.name })
      .from(familyMembers)
      .innerJoin(users, eq(users.id, familyMembers.userId))
      .where(and(eq(familyMembers.familyId, f.id), eq(familyMembers.userId, userId)));
    if (!m) throw notFound('Member');
    await removeMember(f.id, userId);
    await auditFamily(db, f, userId, { event: 'family.remove', decision: 'info', reason: `${m.name} was removed from “${f.name}”.` });
    return current(req.userId);
  });

  app.post('/family/requests', async (req, reply): Promise<FamilyRequest> => {
    const b = parse(cardRequestBody, req.body);
    const r = await requestCardPermission(db, req.userId, b);
    reply.status(201);
    return r;
  });

  app.post('/family/requests/:id/approve', async (req): Promise<FamilyRequest> => approveRequest(db, req.userId, parse(idParam, req.params).id));
  app.post('/family/requests/:id/reject', async (req): Promise<FamilyRequest> => rejectRequest(db, req.userId, parse(idParam, req.params).id));
}
