import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { users } from '../db/schema';
import type { Lang } from './index';

/** The language the user's app uses (kept in sync on every request); English for an unknown user. */
export async function userLang(db: Db, userId: string): Promise<Lang> {
  const [u] = await db.select({ language: users.language }).from(users).where(eq(users.id, userId));
  return u?.language ?? 'en';
}
