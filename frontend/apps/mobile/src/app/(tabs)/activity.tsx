import type { AuditEntry } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { HeroButton, Notice, PillButton, SectionTitle, SlateProgress } from '@/components/slate';
import { Banner, ErrorRow, haptic, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatTime } from '@/lib/format';
import { useActions, useAudit, useKillSwitch, usePermissions, useTransactions, useUpdatePermissions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const levelIcon: Record<keyof typeof levelName, IconName> = { L0: 'eye', L1: 'bulb', L2: 'shieldCheck', L3: 'rocket' };
const actorIcon: Record<AuditEntry['actor'], IconName> = { agent: 'bot', user: 'user', system: 'cpu' };
const actorLabel: Record<AuditEntry['actor'], string> = { agent: 'Agent', user: 'You', system: 'System' };
const decisionLabel: Record<AuditEntry['decision'], string> = { allowed: 'Allowed', blocked: 'Blocked', info: 'Info' };

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
  const cur = useCurrency();
  const { c } = useTheme();
  const perms = usePermissions();
  const audit = useAudit();
  const pending = useActions('pending');
  const txs = useTransactions();
  const kill = useKillSwitch();
  const update = useUpdatePermissions();
  const [exported, setExported] = useState(false);
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

  const decisionStyle = {
    allowed: { bg: c.positiveTint, fg: c.positive, icon: 'check' as IconName },
    blocked: { bg: c.dangerTint, fg: c.dangerInk, icon: 'x' as IconName },
    info: { bg: c.fill, fg: c.secondary, icon: 'info' as IconName },
  };

  const exportLog = async () => {
    setErr(null);
    try {
      const json = JSON.stringify(await api.auditExport(), null, 2);
      if (Platform.OS === 'web') {
        // Browsers: download the file.
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'femate-audit-log.json';
        link.click();
        URL.revokeObjectURL(url);
        setExported(true);
        return;
      }
      const res = await Share.share({ title: 'audit-log.json', message: json });
      setExported(res.action === Share.sharedAction);
    } catch (e) {
      setExported(false);
      onError(e);
    }
  };

  const statusText = stopped
    ? 'Stopped by you'
    : p?.level === 'L3'
      ? 'Active · moves money within limits'
      : p?.level === 'L2'
        ? 'Active · asks before moving money'
        : 'Active · advice only';

  return (
    <Screen
      tabs
      title="Agent"
      right={<HeroButton icon="sliders" label="Change permissions" onPress={() => router.push({ pathname: '/connect-bank', params: { mode: 'edit' } })} />}
      refreshing={audit.isRefetching}
      onRefresh={() => void Promise.all([audit.refetch(), perms.refetch(), pending.refetch()])}
      hero={
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: stopped ? '#2C2C2F' : c.ai, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={stopped ? 'pause' : levelIcon[p?.level ?? 'L1']} size={26} color="#FFFFFF" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title2" color="#FFFFFF">
                {p ? `${levelName[p.level]} · ${p.level}` : '…'}
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
                Moved today {formatAmount(usedToday, cur)} of {formatAmount(p?.dailyLimit ?? 0, cur)}
              </Text>
              <Text variant="footnote" color="rgba(255,255,255,0.56)" tabular>
                {formatAmount(p?.perActionLimit ?? 0, cur)} per action
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
          title={`${pending.data.length} action${pending.data.length > 1 ? 's' : ''} waiting for you`}
          subtitle="Tap to review"
          onPress={() => router.push({ pathname: '/action/[id]', params: { id: pending.data[0]!.id } })}
        />
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionTitle title="What it may see and do" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(p?.scopes ?? []).map((sc) => (
            <View key={sc} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 }}>
              <Icon name={scopeMeta[sc].icon} size={15} color={c.label} strokeWidth={1.9} />
              <Text variant="footnote" weight="600">
                {scopeMeta[sc].label}
              </Text>
            </View>
          ))}
          {p && p.scopes.length === 0 ? (
            <Text variant="footnote" color="secondary">
              Nothing yet. Connect the bank to give it access.
            </Text>
          ) : null}
        </View>
      </View>

      {stopped ? (
        <View accessibilityLiveRegion="polite" style={{ borderRadius: 24, backgroundColor: c.dangerTint, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="pause" size={22} color={c.dangerInk} strokeWidth={2.2} />
            <Text variant="headline" color="dangerInk">
              Agent is stopped
            </Text>
          </View>
          <Text variant="callout" color="body">
            Pending transfers were rejected and every new action is blocked. When you turn it back on, it restarts at L1 Advisor.
          </Text>
          <PillButton
            title="Turn back on at L1"
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
            title="Stop the agent now"
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
            Kill switch: cancels pending actions and blocks every new one.
          </Text>
        </View>
      )}

      {err ? <Notice text={err} /> : null}

      <View>
        <SectionTitle title="Audit log" action={exported ? 'Exported' : 'Export JSON'} onAction={() => void exportLog()} />
        {audit.isError ? <ErrorRow message="Couldn’t load the audit log." onRetry={() => void audit.refetch()} /> : null}
        {audit.isLoading ? <ActivityIndicator color={c.secondary} style={{ paddingVertical: 24 }} /> : null}
        {audit.data && audit.data.items.length === 0 ? (
          <Text variant="callout" color="secondary" style={{ paddingVertical: 12 }}>
            Nothing yet. Every agent decision and money move shows up here.
          </Text>
        ) : null}
        {(audit.data?.items ?? []).map((e, i, all) => {
          const d = decisionStyle[e.decision] ?? decisionStyle.info;
          return (
            <View key={e.id} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: i === all.length - 1 ? 0 : 1, borderBottomColor: c.separator }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: d.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={d.icon} size={15} color={d.fg} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
                  <Text variant="footnote" weight="600" numberOfLines={1} style={{ flex: 1, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}>
                    {e.event}
                  </Text>
                  <Text variant="caption" color="secondary" tabular>
                    {formatTime(e.createdAt)}
                  </Text>
                </View>
                <Text variant="footnote" color="body" style={{ fontSize: 14 }}>
                  {e.reason}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text variant="caption" weight="700" color={d.fg}>
                    {decisionLabel[e.decision] ?? e.decision}
                  </Text>
                  <Text variant="caption" color="secondary">
                    ·
                  </Text>
                  <Icon name={actorIcon[e.actor] ?? 'info'} size={12} color={e.actor === 'agent' ? c.ai : c.secondary} strokeWidth={2.2} />
                  <Text variant="caption" color={e.actor === 'agent' ? c.aiInk : c.secondary}>
                    {actorLabel[e.actor] ?? e.actor} · {e.permissionLevel}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
