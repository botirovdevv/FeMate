// Append-only audit log (PLAN.md §8). Every Policy Guard outcome and user decision lands here.
import type { AuditEntry, PermissionLevel } from '@femate/shared';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { auditLog, permissions } from '../db/schema';
import { maskCards } from '../lib/format';
import { newId } from '../lib/ids';
import { render, t, type Msg } from '../i18n';
import { userLang } from '../i18n/user';

export interface AuditInput {
  actor: AuditEntry['actor'];
  event: string;
  decision: AuditEntry['decision'];
  /** A translatable message (written in the user's language) or text that is already final. */
  reason: string | Msg;
  details?: Record<string, unknown>;
  /** Defaults to the user's current level. */
  level?: PermissionLevel;
}

export async function audit(db: Db, userId: string, e: AuditInput) {
  let level = e.level;
  if (!level) {
    const [p] = await db.select({ level: permissions.level }).from(permissions).where(eq(permissions.userId, userId));
    level = p?.level ?? 'L0';
  }
  const details = e.details ? (JSON.parse(maskCards(JSON.stringify(e.details))) as Record<string, unknown>) : null;
  // A plain string is a key too: static reasons are translated, already-built text passes through unchanged.
  const lang = await userLang(db, userId);
  const reason = typeof e.reason === 'string' ? t(e.reason, undefined, lang) : render(e.reason, lang);
  const [row] = await db
    .insert(auditLog)
    .values({
      id: newId('aud'),
      userId,
      actor: e.actor,
      event: e.event,
      permissionLevel: level,
      decision: e.decision,
      reason: maskCards(reason),
      details,
    })
    .returning();
  return row!;
}
