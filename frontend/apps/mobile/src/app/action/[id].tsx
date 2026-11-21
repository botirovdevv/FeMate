import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { BrandMark, PillButton, StatRows } from '@/components/slate';
import { haptic, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatMoney } from '@/lib/format';
import { useAccounts, useActions, useApproveAction, usePermissions, useRejectAction } from '@/lib/queries';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { PopIn } from '@/components/motion';

function minutesLeft(iso?: string) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000));
}

export default function ActionSheet() {
  const { t } = useT();
  const cur = useCurrency();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useActions();
  const accounts = useAccounts();
  const perms = usePermissions();
  const approve = useApproveAction();
  const reject = useRejectAction();
  const [error, setError] = useState<string | null>(null);

  const a = actions.data?.find((x) => x.id === id);
  if (!a) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sheet }}>
        {actions.isLoading ? (
          <ActivityIndicator color={c.secondary} />
        ) : (
          <Text color="secondary">{t('This action no longer exists.')}</Text>
        )}
      </View>
    );
  }

  const card = accounts.data?.find((x) => x.type === 'card');
  const savings = accounts.data?.find((x) => x.type === 'savings');
  const p = perms.data;
  const amount = a.amount ?? 0;
  const isTransfer = a.type === 'transfer_to_savings';
  const left = minutesLeft(a.expiresAt);
  const done = a.status !== 'pending';

  const checks: { ok: boolean; text: string }[] = isTransfer
    ? [
        { ok: true, text: t('Your own accounts only (Card → Savings)') },
        {
          ok: !!p && amount <= p.perActionLimit,
          text: t('Under the {amount} per-action limit', { amount: formatAmount(p?.perActionLimit ?? 0, cur) }),
        },
        {
          ok: !!p && amount <= p.dailyLimit,
          text: t('Within the {amount} daily agent limit', { amount: formatAmount(p?.dailyLimit ?? 0, cur) }),
        },
        { ok: (card?.balance ?? 0) >= amount, text: t('Card balance covers the amount') },
      ]
    : [{ ok: true, text: t('Budgets never move money') }];

  const onApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync(a.id);
      haptic('success');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };
  const onReject = async () => {
    setError(null);
    try {
      await reject.mutateAsync(a.id);
      haptic('light');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };
  const deciding = approve.isPending || reject.isPending;

  const statusLabel: Record<string, string> = {
    pending: t('Needs your approval'),
    executed: t('Executed'),
    approved: t('Approved'),
    rejected: t('Rejected'),
    blocked: t('Blocked by policy'),
    expired: t('Expired'),
  };

  // Result screen ("Order placed" style): a big mark, one line, the numbers, Done.
  if (done && (a.status === 'executed' || a.status === 'rejected')) {
    const ok = a.status === 'executed';
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.sheet }}
        contentContainerStyle={{ padding: 24, paddingTop: 40, paddingBottom: insets.bottom + 24, gap: 22 }}
      >
        <View style={{ alignItems: 'center', gap: 14 }} accessibilityLiveRegion="polite">
          {/* The result mark springs in, then the text and numbers follow (reference "Order placed"). */}
          <PopIn>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: ok ? c.positiveTint : c.fill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={ok ? 'check' : 'x'} size={46} color={ok ? c.positive : c.secondary} strokeWidth={2.4} />
            </View>
          </PopIn>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {ok ? (isTransfer ? t('Moved to Savings') : t('Budget set')) : t('Nothing was moved')}
          </Text>
          <Text variant="callout" color="secondary" style={{ textAlign: 'center' }}>
            {ok ? (isTransfer ? t('Your money is in Savings.') : a.reason) : t('The agent won’t retry this today.')}
          </Text>
        </View>
        {ok && isTransfer ? (
          <StatRows
            rows={[
              { label: t('Moved'), value: formatMoney(amount, cur) },
              { label: t('Savings now'), value: formatMoney(savings?.balance ?? 0, cur), strong: true },
            ]}
          />
        ) : null}
        <View style={{ gap: 10 }}>
          <PillButton title={t('Done')} onPress={() => router.back()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.sheet }}
      contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: insets.bottom + 24, gap: 20 }}
    >
      <View style={{ gap: 6 }}>
        <BrandMark />
        <Text variant="title" accessibilityRole="header">
          {isTransfer ? t('Confirm transfer') : t('Confirm budget')}
        </Text>
        <Text variant="callout" color="secondary">
          {statusLabel[a.status] ?? t('Needs your approval')} · {t('the agent ({level}) asked, you decide.', { level: p?.level ?? '…' })}
        </Text>
      </View>

      {isTransfer ? (
        <Text
          variant="largeTitle"
          tabular
          style={{ fontSize: 48, lineHeight: 56, letterSpacing: -1, textAlign: 'center' }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(amount, cur)}
        </Text>
      ) : (
        <Text variant="title2" style={{ textAlign: 'center' }}>
          {a.reason}
        </Text>
      )}

      {isTransfer ? (
        <StatRows
          rows={[
            { label: t('From'), value: `${t(card?.name ?? 'Card')} · ${formatAmount(card?.balance ?? 0, cur)}` },
            { label: t('To'), value: `${t('Savings')} · ${formatAmount(savings?.balance ?? 0, cur)}` },
            ...(left !== null && a.status === 'pending' ? [{ label: t('Expires'), value: t('in {n} min', { n: left }) }] : []),
            { label: t('Total today'), value: formatMoney(amount, cur), strong: true },
          ]}
        />
      ) : null}

      {isTransfer && a.status !== 'blocked' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Icon name="bulb" size={18} color={c.label} strokeWidth={2} />
          <Text variant="callout" color="body" style={{ flex: 1 }}>
            {a.reason}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="shield" size={15} color={c.secondary} strokeWidth={2} />
          <Text variant="footnote" color="secondary" weight="600">
            {t('Policy Guard checks')}
          </Text>
        </View>
        {checks.map((ch) => (
          <View key={ch.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: ch.ok ? c.positiveTint : c.dangerTint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={ch.ok ? 'check' : 'x'} size={13} color={ch.ok ? c.positive : c.dangerInk} strokeWidth={2.8} />
            </View>
            <Text variant="callout" style={{ flex: 1 }}>
              {ch.text}
            </Text>
          </View>
        ))}
      </View>

      {a.status === 'blocked' || error ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.dangerTint, padding: 14, borderRadius: 16 }}>
          <Icon name="ban" size={18} color={c.dangerInk} strokeWidth={2.2} />
          <Text variant="footnote" color="dangerInk" style={{ flex: 1 }}>
            {error ?? a.reason}
          </Text>
        </View>
      ) : null}

      {a.status === 'pending' ? (
        <View style={{ gap: 10 }}>
          <PillButton
            title={isTransfer ? t('Approve {amount}', { amount: formatMoney(amount, cur) }) : t('Approve')}
            icon="check"
            onPress={() => void onApprove()}
            loading={approve.isPending}
            disabled={deciding}
          />
          <PillButton
            title={t('Reject')}
            variant="secondary"
            onPress={() => void onReject()}
            loading={reject.isPending}
            disabled={deciding}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
            <Icon name="shieldCheck" size={13} color={c.secondary} strokeWidth={2} />
            <Text variant="caption" color="secondary">
              {t('Checked again when you approve · swipe down to decide later')}
            </Text>
          </View>
        </View>
      ) : (
        <PillButton title={t('Close')} variant="secondary" onPress={() => router.back()} />
      )}
    </ScrollView>
  );
}
