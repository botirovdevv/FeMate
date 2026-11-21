import type { FamilyOverview, FamilyRequest } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import {
  CircleAction,
  HeroButton,
  HeroHeader,
  Notice,
  PillButton,
  SectionTitle,
  SlateLoading,
  SlatePage,
  SlateProgress,
  SlateRow,
  StatRows,
  useSlate,
} from '@/components/slate';
import { haptic, PressableScale, Text } from '@/components/ui';
import { categoryIcon } from '@/lib/categories';
import { errorMessage } from '@/lib/api';
import { formatMoney, formatTime } from '@/lib/format';
import {
  useApproveFamilyRequest,
  useDeleteFamily,
  useFamily,
  useLeaveFamily,
  useRejectFamilyRequest,
  useRemoveFamilyMember,
} from '@/lib/queries';
import { msg, t as tGlobal, useT } from '@/i18n';
import { CountUp } from '@/components/motion';

// Long form for the row subtitle, short for the right-hand status.
const STATUS: Record<FamilyRequest['status'], string> = {
  pending: msg('Waiting'),
  approved: msg('Approved · use within 24 h'),
  used: msg('Done'),
  rejected: msg('Declined'),
  expired: msg('Expired'),
};
const STATUS_SHORT: Record<FamilyRequest['status'], string> = {
  pending: msg('Waiting'),
  approved: msg('Approved'),
  used: msg('Done'),
  rejected: msg('Declined'),
  expired: msg('Expired'),
};

const daysLeftInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

/** Asks before a destructive step. Web has no native Alert, so it uses the browser's confirm. */
function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    // t('Cancel')
    { text: tGlobal('Cancel'), style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}

export default function FamilyScreen() {
  const { t } = useT();
  const family = useFamily();
  const s = useSlate();

  if (family.isPending) {
    return <SlatePage hero={<HeroHeader title={t('Family')} back />}>{<SlateLoading />}</SlatePage>;
  }
  if (family.isError) {
    return (
      <SlatePage hero={<HeroHeader title={t('Family')} back />} refreshing={family.isRefetching} onRefresh={() => void family.refetch()}>
        <Notice text={errorMessage(family.error)} />
        <PillButton title={t('Try again')} variant="secondary" onPress={() => void family.refetch()} />
      </SlatePage>
    );
  }
  if (!family.data) return <NoFamily />;
  return (
    <SlatePage hero={<FamilyHero o={family.data} />} refreshing={family.isRefetching} onRefresh={() => void family.refetch()}>
      {family.data.role === 'manager' ? <ManagerView o={family.data} /> : <MemberView o={family.data} />}
      <Text style={{ fontSize: 12, lineHeight: 17, color: s.muted, textAlign: 'center' }}>
        {t('Only spends marked “From family budget” count here. Everyone’s personal budget stays their own.')}
      </Text>
    </SlatePage>
  );
}

function NoFamily() {
  const { t } = useT();
  const s = useSlate();
  return (
    <SlatePage
      hero={
        <HeroHeader title={t('Family')} back>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 15, color: s.heroMuted }}>{t('One budget for the whole family')}</Text>
            <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '600', color: s.heroText, letterSpacing: -0.4 }}>
              {t('Share a monthly budget, keep control of the big spends.')}
            </Text>
          </View>
        </HeroHeader>
      }
    >
      <View style={{ gap: 4 }}>
        <SlateRow
          icon="target"
          title={t('A shared monthly budget')}
          subtitle={t('The parent who creates the family sets it. Spends past it are blocked.')}
        />
        <SlateRow
          icon="shieldCheck"
          title={t('Approval for big spends')}
          subtitle={t('Anything over your approval limit waits for your OK.')}
        />
        <SlateRow icon="family" title={t('Join with a code')} subtitle={t('Each family member uses their own FeMate account.')} />
        <SlateRow
          icon="eye"
          title={t('Private by default')}
          last
          subtitle={t('Members see the family totals. Only the manager sees who spent what.')}
        />
      </View>
      <View style={{ gap: 12 }}>
        <PillButton title={t('Create a family')} icon="plus" onPress={() => router.push('/family/create')} />
        <PillButton title={t('Join with a code')} icon="key" variant="secondary" onPress={() => router.push('/family/join')} />
      </View>
    </SlatePage>
  );
}

function FamilyHero({ o }: { o: FamilyOverview }) {
  const { t, tn } = useT();
  const s = useSlate();
  const cur = o.family.currency;
  const used = o.budget.limit > 0 ? o.budget.spent / o.budget.limit : 1;
  const out = o.budget.remaining <= 0;
  return (
    <HeroHeader
      title={o.family.name}
      back
      right={
        o.role === 'manager' ? (
          <HeroButton icon="plus" label={t('Invite a family member')} onPress={() => router.push('/family/invite')} />
        ) : undefined
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 14, color: s.heroMuted }}>{out ? t('Family budget used up') : t('Left this month')}</Text>
        <CountUp
          style={{ fontSize: 44, lineHeight: 52, fontWeight: '600', color: s.heroText, letterSpacing: -1, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
          adjustsFontSizeToFit
          value={o.budget.remaining}
          format={(n) => formatMoney(n, cur)}
        />
      </View>
      <View style={{ gap: 10 }}>
        <SlateProgress value={used} onHero />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ fontSize: 13, color: s.heroMuted, fontVariant: ['tabular-nums'] }}>
            {formatMoney(o.budget.spent, cur)} of {formatMoney(o.budget.limit, cur)}
          </Text>
          <Text style={{ fontSize: 13, color: s.heroMuted }}>resets in {daysLeftInMonth()} days</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: s.heroMuted }}>
        {o.role === 'manager' ? t('You manage this family') : t('Managed by {name}', { name: o.family.managerName })} ·{' '}
        {tn('{n} person|{n} people', o.memberCount)}
      </Text>
    </HeroHeader>
  );
}

function RequestRow({
  r,
  cur,
  manager,
  last,
}: {
  r: FamilyRequest;
  cur: FamilyOverview['family']['currency'];
  manager: boolean;
  last?: boolean;
}) {
  const { t } = useT();
  const s = useSlate();
  const approve = useApproveFamilyRequest();
  const reject = useRejectFamilyRequest();
  const [error, setError] = useState<string | null>(null);
  const busy = approve.isPending || reject.isPending;
  const decide = async (yes: boolean) => {
    setError(null);
    try {
      await (yes ? approve : reject).mutateAsync(r.id);
      haptic(yes ? 'success' : 'light');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };
  const what = r.kind === 'card' ? t('Card purchase up to · {what}', { what: r.description }) : r.description;
  const who = manager ? `${r.memberName} · ` : '';
  const pendingForMe = manager && r.status === 'pending';
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: s.border, paddingBottom: pendingForMe ? 14 : 0 }}>
      <SlateRow
        icon={r.kind === 'card' ? 'card' : categoryIcon[r.category]}
        title={what}
        subtitle={`${who}${r.status === 'pending' ? t('asked {time}', { time: formatTime(r.createdAt) }) : t(STATUS[r.status])}`}
        last
        right={
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: s.text, fontVariant: ['tabular-nums'] }}>
              {formatMoney(r.amount, cur)}
            </Text>
            {!pendingForMe ? (
              <Text
                style={{
                  fontSize: 12,
                  color: r.status === 'used' || r.status === 'approved' ? s.positive : r.status === 'rejected' ? s.danger : s.muted,
                }}
              >
                {t(STATUS_SHORT[r.status])}
              </Text>
            ) : null}
          </View>
        }
      />
      {pendingForMe ? (
        <View style={{ gap: 10 }}>
          {error ? <Notice text={error} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PillButton
              title={t('Decline')}
              variant="secondary"
              onPress={() => void decide(false)}
              disabled={busy}
              loading={reject.isPending}
              style={{ flex: 1, height: 46 }}
            />
            <PillButton
              title={t('Approve')}
              icon="check"
              onPress={() => void decide(true)}
              disabled={busy}
              loading={approve.isPending}
              style={{ flex: 1, height: 46 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ManagerView({ o }: { o: FamilyOverview }) {
  const { t } = useT();
  const s = useSlate();
  const cur = o.family.currency;
  const remove = useRemoveFamilyMember();
  const del = useDeleteFamily();
  const [error, setError] = useState<string | null>(null);
  const pending = o.requests.filter((r) => r.status === 'pending');
  const history = o.requests.filter((r) => r.status !== 'pending').slice(0, 6);
  const members = [...(o.members ?? [])].sort((a, b) => b.spent - a.spent);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <CircleAction icon="key" label={t('Invite')} onPress={() => router.push('/family/invite')} />
        <CircleAction
          icon="sliders"
          label={t('Budget')}
          onPress={() => router.push({ pathname: '/family/budget', params: { field: 'budget' } })}
        />
        <CircleAction
          icon="shieldCheck"
          label={t('Approval')}
          onPress={() => router.push({ pathname: '/family/budget', params: { field: 'threshold' } })}
        />
        <CircleAction icon="card" label={t('Card')} onPress={() => router.push('/card')} />
      </View>

      {error ? <Notice text={error} /> : null}

      {pending.length ? (
        <View style={{ gap: 4 }}>
          <SectionTitle title={t('Waiting for you · {n}', { n: pending.length })} />
          {pending.map((r, i) => (
            <RequestRow key={r.id} r={r} cur={cur} manager last={i === pending.length - 1} />
          ))}
        </View>
      ) : null}

      <StatRows
        rows={[
          { label: t('Monthly budget'), value: formatMoney(o.family.monthlyBudget, cur) },
          {
            label: t('Needs your approval'),
            value:
              o.family.approvalThreshold > 0
                ? t('over {amount}', { amount: formatMoney(o.family.approvalThreshold, cur) })
                : t('every spend'),
          },
          { label: t('Spent this month'), value: formatMoney(o.budget.spent, cur), strong: true },
        ]}
      />

      <View style={{ gap: 4 }}>
        <SectionTitle title={t('Who spent what')} />
        {members.map((m, i) => {
          const share = o.budget.spent > 0 ? Math.round((m.spent / o.budget.spent) * 100) : 0;
          return (
            <SlateRow
              key={m.userId}
              avatar={initial(m.name)}
              title={m.role === 'manager' ? t('{name} (you)', { name: m.name }) : m.name}
              subtitle={m.role === 'manager' ? t('Manager') : t('Member · tap to remove')}
              last={i === members.length - 1}
              right={
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: s.text, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(m.spent, cur)}
                  </Text>
                  <Text style={{ fontSize: 12, color: s.muted }}>{share}%</Text>
                </View>
              }
              onPress={
                m.role === 'member'
                  ? () =>
                      confirm(
                        t('Remove {name}?', { name: m.name }),
                        t('{name} will leave the family. Their spending so far stays in the history.', { name: m.name }),
                        t('Remove'),
                        () => void run(() => remove.mutateAsync(m.userId)),
                      )
                  : undefined
              }
            />
          );
        })}
        {members.length === 1 ? (
          <PressableScale onPress={() => router.push('/family/invite')} accessibilityRole="button" style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 15, color: s.text, fontWeight: '600' }}>{t('+ Invite your family with a code')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {history.length ? (
        <View style={{ gap: 4 }}>
          <SectionTitle title={t('Recent requests')} />
          {history.map((r, i) => (
            <RequestRow key={r.id} r={r} cur={cur} manager last={i === history.length - 1} />
          ))}
        </View>
      ) : null}

      <PillButton
        title={t('Delete family')}
        variant="danger"
        icon="ban"
        loading={del.isPending}
        onPress={() =>
          confirm(
            t('Delete the family?'),
            t('Everyone leaves and the shared budget ends. Spending history stays.'),
            t('Delete'),
            () =>
              void run(async () => {
                await del.mutateAsync();
                router.back();
              }),
          )
        }
      />
    </>
  );
}

function MemberView({ o }: { o: FamilyOverview }) {
  const { t } = useT();
  const cur = o.family.currency;
  const leave = useLeaveFamily();
  const [error, setError] = useState<string | null>(null);
  const mine = o.requests;
  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        <CircleAction icon="plus" label={t('Add spend')} onPress={() => router.push('/(tabs)/add')} />
        <CircleAction icon="hand" label={t('Ask')} onPress={() => router.push('/family/request')} />
        <CircleAction icon="card" label={t('Card')} onPress={() => router.push('/card')} />
        <CircleAction
          icon="logout"
          label={t('Leave')}
          onPress={() =>
            confirm(
              t('Leave the family?'),
              t('You’ll stop sharing {family}’s budget. Your own budget stays.', { family: o.family.name }),
              t('Leave'),
              () =>
                void (async () => {
                  setError(null);
                  try {
                    await leave.mutateAsync();
                    router.back();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                })(),
            )
          }
        />
      </View>

      {error ? <Notice text={error} /> : null}

      <StatRows
        rows={[
          { label: t('Monthly budget'), value: formatMoney(o.family.monthlyBudget, cur) },
          {
            label: t('{name} approves', { name: o.family.managerName }),
            value:
              o.family.approvalThreshold > 0
                ? t('over {amount}', { amount: formatMoney(o.family.approvalThreshold, cur) })
                : t('every spend'),
          },
          { label: t('Left this month'), value: formatMoney(o.budget.remaining, cur), strong: true },
        ]}
      />

      <View style={{ gap: 4 }}>
        <SectionTitle title={t('Your requests')} />
        {mine.length ? (
          mine.map((r, i) => <RequestRow key={r.id} r={r} cur={cur} manager={false} last={i === mine.length - 1} />)
        ) : (
          <SlateRow
            icon="shieldCheck"
            title={t('Nothing waiting')}
            subtitle={t('A family spend over {amount} goes to {name} first.', {
              amount: formatMoney(o.family.approvalThreshold, cur),
              name: o.family.managerName,
            })}
            last
          />
        )}
      </View>
    </>
  );
}
