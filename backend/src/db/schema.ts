// Database schema (PLAN.md §7). Money is an integer in the user's currency's minor unit, ids are prefixed nanoids.
import type {
  AgentActionStatus,
  AuditEntry,
  Category,
  Currency,
  FamilyRequestKind,
  FamilyRequestStatus,
  FamilyRole,
  PermissionLevel,
  Scope,
  TransactionSource,
  VoiceLanguage,
} from '@femate/shared';
import type { Lang } from '../i18n';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const userRef = () =>
  text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  monthlyIncome: integer('monthly_income').notNull().default(0),
  savingsGoalMonthly: integer('savings_goal_monthly').notNull().default(0),
  fixedCostsMonthly: integer('fixed_costs_monthly').notNull().default(0),
  reportTime: text('report_time').notNull().default('21:00'),
  currency: text('currency').$type<Currency>().notNull().default('UZS'),
  voiceLanguage: text('voice_language').$type<VoiceLanguage>().notNull().default('auto'),
  // App language (uz | ru | en), for text sent without a request: pushes, Telegram, the daily report.
  language: text('language').$type<Lang>().notNull().default('en'),
  telegramChatId: text('telegram_chat_id'),
  expoPushToken: text('expo_push_token'),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    type: text('type').$type<'card' | 'savings' | 'cash'>().notNull(),
    name: text('name').notNull(),
    balance: integer('balance').notNull(),
    currency: text('currency').$type<Currency>().notNull().default('UZS'),
    createdAt: createdAt(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    direction: text('direction').$type<'out' | 'in'>().notNull(),
    category: text('category').$type<Category>().notNull(),
    description: text('description').notNull(),
    source: text('source').$type<TransactionSource>().notNull(),
    // What the user entered when it wasn't their currency ("coffee $5" on a UZS account).
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency').$type<Currency>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    // Set when the spend was paid from the family budget; kept as plain text so deleting a family keeps the history.
    familyId: text('family_id'),
    createdAt: createdAt(),
  },
  (t) => [index('transactions_user_time_idx').on(t.userId, t.occurredAt), index('transactions_family_time_idx').on(t.familyId, t.occurredAt)],
);

export const budgets = pgTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    category: text('category').$type<Category>().notNull(),
    monthlyLimit: integer('monthly_limit').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('budgets_user_category_idx').on(t.userId, t.category)],
);

export const permissions = pgTable('permissions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  level: text('level').$type<PermissionLevel>().notNull().default('L0'),
  scopes: jsonb('scopes').$type<Scope[]>().notNull().default([]),
  perActionLimit: integer('per_action_limit').notNull().default(0),
  dailyLimit: integer('daily_limit').notNull().default(0),
  agentEnabled: boolean('agent_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentActions = pgTable(
  'agent_actions',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    type: text('type').$type<'transfer_to_savings' | 'set_budget'>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    amount: integer('amount'),
    reason: text('reason').notNull(),
    status: text('status').$type<AgentActionStatus>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('agent_actions_user_idx').on(t.userId, t.createdAt)],
);

export const recommendations = pgTable('recommendations', {
  id: text('id').primaryKey(),
  userId: userRef(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  monthlySaving: integer('monthly_saving').notNull(),
  actionType: text('action_type').$type<'transfer_to_savings' | 'set_budget'>(),
  actionPayload: jsonb('action_payload').$type<Record<string, unknown>>(),
  status: text('status').$type<'new' | 'applied' | 'dismissed'>().notNull().default('new'),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    actor: text('actor').$type<AuditEntry['actor']>().notNull(),
    event: text('event').notNull(),
    permissionLevel: text('permission_level').$type<PermissionLevel>().notNull(),
    decision: text('decision').$type<AuditEntry['decision']>().notNull(),
    reason: text('reason').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_user_time_idx').on(t.userId, t.createdAt)],
);

// Chat history for the agent; only the last 10 messages are sent to the LLM (PLAN.md §10).
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_user_time_idx').on(t.userId, t.createdAt)],
);

export const telegramLinkCodes = pgTable('telegram_link_codes', {
  code: text('code').primaryKey(),
  userId: userRef(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// FeMate virtual card (Lithic), one per user. The full number and CVV stay at Lithic.
export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Purchases are paid from this account (the user's card account).
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  lithicToken: text('lithic_token').notNull().unique(),
  network: text('network').$type<'VISA' | 'MASTERCARD'>().notNull(),
  lastFour: text('last_four').notNull(),
  expMonth: text('exp_month').notNull(),
  expYear: text('exp_year').notNull(),
  frozen: boolean('frozen').notNull().default(false),
  blockOverBudget: boolean('block_over_budget').notNull().default(true),
  // Purchases count against the family budget (and its approval limit) instead of only the personal one.
  payFromFamily: boolean('pay_from_family').notNull().default(false),
  createdAt: createdAt(),
});

// Every live approve/decline decision (Auth Stream Access). The Lithic token makes retries idempotent.
export const cardAuthorizations = pgTable(
  'card_authorizations',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    lithicToken: text('lithic_token').notNull().unique(),
    amount: integer('amount').notNull(),
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency').$type<Currency>(),
    merchant: text('merchant').notNull(),
    mcc: text('mcc'),
    category: text('category').$type<Category>().notNull(),
    result: text('result').notNull(),
    reason: text('reason').notNull(),
    transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('card_auth_user_time_idx').on(t.userId, t.createdAt)],
);

// Proactive spending alerts already sent, so each fires once per day / category-week.
export const alerts = pgTable(
  'alerts',
  {
    id: text('id').primaryKey(),
    userId: userRef(),
    kind: text('kind').$type<'day_over' | 'category_up' | 'anomaly'>().notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('alerts_user_kind_key_idx').on(t.userId, t.kind, t.key)],
);

// Family budget: one manager (a parent), members join with an invite code, one family per user.
export const families = pgTable('families', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  managerId: text('manager_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Amounts are in the manager's currency at creation time.
  currency: text('currency').$type<Currency>().notNull(),
  monthlyBudget: integer('monthly_budget').notNull(),
  // A member's family spend above this needs the manager's approval.
  approvalThreshold: integer('approval_threshold').notNull(),
  createdAt: createdAt(),
});

export const familyMembers = pgTable(
  'family_members',
  {
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<FamilyRole>().notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('family_members_family_idx').on(t.familyId)],
);

export const familyInvites = pgTable('family_invites', {
  code: text('code').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

// A member's family spend waiting for the manager: an expense to record, or a card purchase to allow.
export const familyRequests = pgTable(
  'family_requests',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: userRef(),
    kind: text('kind').$type<FamilyRequestKind>().notNull(),
    // In the family's currency.
    amount: integer('amount').notNull(),
    category: text('category').$type<Category>().notNull(),
    description: text('description').notNull(),
    status: text('status').$type<FamilyRequestStatus>().notNull(),
    transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('family_requests_family_idx').on(t.familyId, t.createdAt)],
);
