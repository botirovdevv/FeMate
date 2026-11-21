import type { Category, TransactionSource } from '@femate/shared';

import type { IconName } from '@/components/Icon';
import { t } from '@/i18n';

export const categoryIcon: Record<Category, IconName> = {
  transport: 'transport',
  food: 'food',
  utilities: 'utilities',
  shopping: 'shopping',
  health: 'health',
  entertainment: 'entertainment',
  education: 'education',
  transfer: 'transfer',
  other: 'other',
};

export const sourceIcon: Record<TransactionSource, IconName> = {
  bank: 'bank',
  manual: 'pen',
  voice: 'mic',
  sms_forward: 'send',
  agent: 'bot',
  card: 'card',
};

const SOURCE_EN: Record<TransactionSource, string> = {
  bank: 'Bank',
  manual: 'Typed',
  voice: 'Voice',
  sms_forward: 'SMS',
  agent: 'Agent',
  card: 'Card',
};
// t('Bank') t('Typed') t('Voice') t('SMS') t('Agent') t('Card')
export const sourceLabel = new Proxy(SOURCE_EN, { get: (en, k: string) => t(en[k as TransactionSource] ?? k) }) as Record<TransactionSource, string>;
