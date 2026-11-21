import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { HeroButton, Notice, PillButton, SectionTitle, SlateProgress } from '@/components/slate';
import { Banner, haptic, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount } from '@/lib/format';
import { useActions, useKillSwitch, usePermissions, useTransactions, useUpdatePermissions } from '@/lib/queries';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

// t('Read-only') t('Advisor') t('Co-pilot') t('Autopilot') t('Balances') t('Transactions') t('Own transfers')
const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const levelIcon: Record<keyof typeof levelName, IconName> = { L0: 'eye', L1: 'bulb', L2: 'shieldCheck', L3: 'rocket' };

/** 00:00 today in Tashkent, where the server counts the agent's daily limit. */
function tashkentDayStart(now = Date.now()): number {
  const day = new Date(now + 5 * 3600_000).toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00+05:00`);
}
const scopeMeta = {
  read_balance: { label: 'Balances', icon: 'eye' },
  read_transactions: { label: 'Transactions', icon: 'list' },
  transfer_own: { label: 'Own transfers', icon: 'transfer' },
} as const;

export default function Activity() {
  const { t, tn } = useT();
  const cur = useCurrency();
  const { c } = useTheme();
  const perms = usePermissions();
  const pending = useActions('pending');
  const txs = useTransactions();
  const kill = useKillSwitch();
  const update = useUpdatePermissions();
  const [err, setErr] = useState<string | null>(null);

  const p = perms.data;
  const stopped = p ? !p.agentEnabled : false;
  // Money the agent moved to Savings today: what the daily limit counts.
  const dayStart = tashkentDayStart();
  const usedToday = (txs.data?.items ?? [])
    .filter((t) => t.source === 'agent' && t.category === 'transfer' && Date.parse(t.occurredAt) >= dayStart)
    .reduce((s, t) => s + t.amount, 0);
  const onError = (e: unknown) => {
    haptic('warning');
    setErr(errorMessage(e));
  };

  const statusText = stopped
    ? t('Stopped by you')
    : p?.level === 'L3'
      ? t('Active · moves money within limits')
      : p?.level === 'L2'
        ? t('Active · asks before moving money')
        : t('Active · advice only');

  return (
    <Screen
      tabs
      title={t("Agent")}
      right={<HeroButton icon="sliders" label={t("Change permissions")} onPress={() => router.push({ pathname: '/connect-bank', params: { mode: 'edit' } })} />}
      refreshing={perms.isRefetching}
      onRefresh={() => void Promise.all([perms.refetch(), pending.refetch(), txs.refetch()])}
      hero={
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: stopped ? '#2C2C2F' : c.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={stopped ? 'pause' : levelIcon[p?.level ?? 'L1']} size={26} color={stopped ? '#FFFFFF' : c.onBrand} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title2" color="#FFFFFF">
                {p ? `${t(levelName[p.level])} · ${p.level}` : '…'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: stopped ? '#FF6B61' : '#34C77B' }} />
                <Text variant="footnote" color="rgba(255,255,255,0.7)">
                  {statusText}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="footnote" color="rgba(255,255,255,0.56)" tabular>
                {t('Moved today {used} of {limit}', { used: formatAmount(usedToday, cur), limit: formatAmount(p?.dailyLimit ?? 0, cur) })}
              </Text>
              <Text variant="footnote" color="rgba(255,255,255,0.56)" tabular>
                {t('{amount} per action', { amount: formatAmount(p?.perActionLimit ?? 0, cur) })}
              </Text>
            </View>
            <SlateProgress value={p?.dailyLimit ? usedToday / p.dailyLimit : 0} onHero />
          </View>
        </View>
      }
    >
      {pending.data?.length ? (
        <Banner
          tone="warn"
          icon="shieldAlert"
          title={tn('{n} action waiting for you|{n} actions waiting for you', pending.data.length)}
          subtitle={t("Tap to review")}
          onPress={() => router.push({ pathname: '/action/[id]', params: { id: pending.data[0]!.id } })}
        />
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title={t("What it may see and do")} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(p?.scopes ?? []).map((sc) => (
            <View key={sc} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}>
              <Icon name={scopeMeta[sc].icon} size={15} color={c.label} strokeWidth={1.9} />
              <Text variant="footnote" weight="600">
                {t(scopeMeta[sc].label)}
              </Text>
            </View>
          ))}
          {p && p.scopes.length === 0 ? (
            <Text variant="footnote" color="secondary">
              {t('Nothing yet. Connect the bank to give it access.')}
            </Text>
          ) : null}
        </View>
      </View>

      {stopped ? (
        <View accessibilityLiveRegion="polite" style={{ borderRadius: 24, backgroundColor: c.dangerTint, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="pause" size={22} color={c.dangerInk} strokeWidth={2.2} />
            <Text variant="headline" color="dangerInk">
              {t('Agent is stopped')}
            </Text>
          </View>
          <Text variant="callout" color="body">
            {t('Pending transfers were rejected and every new action is blocked. When you turn it back on, it restarts at L1 Advisor.')}
          </Text>
          <PillButton
            title={t("Turn back on at L1")}
            icon="refresh"
            loading={update.isPending}
            onPress={() => {
              setErr(null);
              update.mutate({ level: 'L1', agentEnabled: true }, { onError });
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <PillButton
            title={t("Stop the agent now")}
            icon="power"
            variant="danger"
            loading={kill.isPending}
            onPress={() => {
              haptic('warning');
              setErr(null);
              kill.mutate(undefined, { onError });
            }}
          />
          <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
            {t('Kill switch: cancels pending actions and blocks every new one.')}
          </Text>
        </View>
      )}

      {err ? <Notice text={err} /> : null}

    </Screen>
  );
}
