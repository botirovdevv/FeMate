import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { FamilySummary } from '@/components/FamilySummary';
import { Icon, type IconName } from '@/components/Icon';
import { InsightCard } from '@/components/InsightCard';
import { CircleAction, HeroButton, HeroHeader, SectionTitle, SlateLoading, SlatePage, SlateProgress, SlateRow, useSlate } from '@/components/slate';
import { Banner, ErrorRow, PressableScale, Text } from '@/components/ui';
import { categoryIcon, sourceLabel } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney, formatTime, greeting } from '@/lib/format';
import { periodRange } from '@/lib/period';
import { useAccounts, useActions, useDailySummary, useInsight, useMe, usePeriodSummary, useTransactions } from '@/lib/queries';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

// Home answers three questions in this order: how much can I still spend today, what should I do about it,
// and where is my money. Everything else is one tap away.
export default function Home() {
  const cur = useCurrency();
  const { c } = useTheme();
  const sl = useSlate();
  const { t } = useT();
  const me = useMe();
  const accounts = useAccounts();
  const summary = useDailySummary();
  const insight = useInsight();
  const txs = useTransactions();
  const pending = useActions('pending');
  // This month's categories come from the server's totals, not from the last few transactions.
  const month = useMemo(() => periodRange('month'), []);
  const period = usePeriodSummary(month.from, month.to);

  const refreshing = accounts.isRefetching || summary.isRefetching || txs.isRefetching;
  const refresh = () =>
    void Promise.all([accounts.refetch(), summary.refetch(), txs.refetch(), pending.refetch(), insight.refetch(), period.refetch()]);

  const categories = useMemo(() => {
    const all = (period.data?.byCategory ?? []).filter((x) => x.category !== 'transfer' && x.amount > 0).sort((a, b) => b.amount - a.amount);
    const sum = all.reduce((n, x) => n + x.amount, 0);
    return { top: all.slice(0, 4), sum };
  }, [period.data]);

  const total = (accounts.data ?? []).reduce((n, a) => n + a.balance, 0);
  const noMoneyYet = !!accounts.data && accounts.data.every((a) => a.balance === 0) && txs.data?.items.length === 0;
  const cashBelowZero = (accounts.data?.find((a) => a.type === 'cash')?.balance ?? 0) < 0;
  const s = summary.data;
  const spentRatio = s ? s.todaySpent / Math.max(1, s.dailyAllowance) : 0;
  const over = s ? s.remainingToday < 0 : false;
  const firstPending = pending.data?.[0];
  const firstName = me.data?.name.split(' ')[0];

  const actions: { label: string; icon: IconName; href: Href }[] = [
    { label: t('Expense'), icon: 'plus', href: '/add' },
    { label: t('Add money'), icon: 'wallet', href: { pathname: '/money', params: { mode: 'add' } } },
    { label: t('Move'), icon: 'transfer', href: { pathname: '/money', params: { mode: 'move' } } },
    { label: t('Fix cash'), icon: 'tune', href: { pathname: '/money', params: { mode: 'set', account: 'cash' } } },
  ];
  const accountIcon: Record<string, IconName> = { card: 'card', savings: 'savings', cash: 'cash' };

  const hero = (
    <HeroHeader
      title={firstName ? t('Hello, {name}', { name: firstName }) : greeting()}
      right={<HeroButton icon="sliders" label={t("Settings")} onPress={() => router.push('/settings')} />}
    >
      {s ? (
        <>
          <View style={{ gap: 4 }}>
            <Text variant="footnote" color={over ? '#F5B65C' : sl.heroMuted} weight={over ? '600' : '400'} style={{ fontSize: 14 }}>
              {over ? t('Over today’s limit by') : t('You can still spend today')}
            </Text>
            <Text
              variant="largeTitle"
              tabular
              color={over ? '#F5B65C' : sl.heroText}
              style={{ fontSize: 44, lineHeight: 52, letterSpacing: -1 }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(Math.abs(s.remainingToday), cur)}
            </Text>
          </View>
          <View style={{ gap: 10 }}>
            <SlateProgress value={spentRatio} onHero />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="footnote" color={sl.heroMuted} tabular>
                Spent {formatAmount(s.todaySpent, cur)}
              </Text>
              <Text variant="footnote" color={sl.heroMuted} tabular>
                Daily limit {formatAmount(s.dailyAllowance, cur)}
              </Text>
            </View>
          </View>
        </>
      ) : summary.isError ? (
        <ErrorRow message={t("Couldn’t load today’s limit.")} onRetry={() => void summary.refetch()} />
      ) : (
        <View style={{ height: 120, justifyContent: 'center' }}>
          <SlateLoading />
        </View>
      )}
    </HeroHeader>
  );

  return (
    <SlatePage tabs hero={hero} refreshing={refreshing} onRefresh={refresh}>
      {/* Quick actions, round icons with labels under them. */}
      <View style={{ flexDirection: 'row' }}>
        {actions.map((a) => (
          <CircleAction key={a.label} icon={a.icon} label={a.label} active={a.label === t('Expense')} onPress={() => router.push(a.href)} />
        ))}
      </View>

      {firstPending || noMoneyYet || cashBelowZero ? (
        <View style={{ gap: 10 }}>
          {firstPending ? (
            <Banner
              tone="warn"
              icon="shieldAlert"
              title={firstPending.type === 'transfer_to_savings' ? t('Move {amount} to Savings?', { amount: formatMoney(firstPending.amount ?? 0, cur) }) : t('Set a food budget?')}
              subtitle={t("Waiting for your approval")}
              onPress={() => router.push({ pathname: '/action/[id]', params: { id: firstPending.id } })}
            />
          ) : null}
          {noMoneyYet ? (
            <Banner
              tone="success"
              icon="wallet"
              title={t("Add the money you have")}
              subtitle={t("Your card, cash and savings start at zero. Tap to enter what you really have.")}
              onPress={() => router.push('/balances')}
            />
          ) : cashBelowZero ? (
            <Banner
              tone="warn"
              icon="cash"
              title={t("Your cash is below zero")}
              subtitle={t("You recorded more cash spending than you had. Tap to set what’s in your wallet.")}
              onPress={() => router.push({ pathname: '/money', params: { mode: 'set', account: 'cash' } })}
            />
          ) : null}
        </View>
      ) : null}

      {/* What to do about it: the assistant's check-in, only when something needs attention. */}
      {insight.data?.status === 'over' ? <InsightCard insight={insight.data} compact /> : null}

      {/* Shared family budget, when the user is in a family. */}
      <FamilySummary />

      {/* Where the money is. */}
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <SectionTitle title={t("Balances")} />
          <Text variant="callout" color="secondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
            {accounts.data ? formatMoney(total, cur) : '…'}
          </Text>
        </View>
        {accounts.isError ? <ErrorRow message={t("Couldn’t load your balances.")} onRetry={() => void accounts.refetch()} /> : null}
        {accounts.isLoading ? <SlateLoading /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(accounts.data ?? []).map((a) => {
            const tile = (
              <>
                <View
                  style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.separator, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name={accountIcon[a.type] ?? 'cash'} size={17} color={c.label} />
                </View>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {a.name}
                </Text>
                <Text variant="callout" weight="600" tabular numberOfLines={1} adjustsFontSizeToFit>
                  {formatAmount(a.balance, cur)}
                </Text>
              </>
            );
            const box = { backgroundColor: c.card, borderRadius: 20, padding: 14, gap: 8 };
            // The card account opens the FeMate card screen.
            return (
              <View key={a.id} style={{ flex: 1 }}>
                {a.type === 'card' ? (
                  <PressableScale onPress={() => router.push('/card')} accessibilityRole="button" accessibilityLabel={t('{name}, open FeMate card', { name: a.name })} style={box}>
                    {tile}
                  </PressableScale>
                ) : (
                  <View style={box}>{tile}</View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {categories.top.length ? (
        <View style={{ gap: 14 }}>
          <SectionTitle title={t("This month")} action={t("Reports")} onAction={() => router.push('/reports')} />
          <View style={{ backgroundColor: c.card, borderRadius: 24, padding: 18, gap: 14 }}>
            <View style={{ gap: 2 }}>
              <Text variant="footnote" color="secondary">
                {t('Spent this month')}
              </Text>
              <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(categories.sum, cur)}
              </Text>
            </View>
            {/* One segmented bar: each category's share, darkest first. */}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {categories.top.map((x, i) => (
                <View key={x.category} style={{ flex: Math.max(0.06, x.amount / Math.max(1, categories.sum)), height: 8, borderRadius: 4, backgroundColor: c.categoryShades[i] ?? c.fill2 }} />
              ))}
            </View>
            <View>
              {categories.top.map((x, i) => (
                <SlateRow
                  key={x.category}
                  icon={categoryIcon[x.category]}
                  title={categoryLabel[x.category]}
                  last={i === categories.top.length - 1}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text variant="callout" weight="600" tabular>
                        {formatAmount(x.amount, cur)}
                      </Text>
                      <Text variant="footnote" color="secondary" tabular style={{ width: 36, textAlign: 'right' }}>
                        {Math.round((x.amount / Math.max(1, categories.sum)) * 100)}%
                      </Text>
                    </View>
                  }
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        <SectionTitle title={t("Recent transactions")} action={t("See all")} onAction={() => router.push('/transactions')} />
        {txs.isError ? <ErrorRow message={t("Couldn’t load transactions.")} onRetry={() => void txs.refetch()} /> : null}
        {txs.data && txs.data.items.length === 0 ? (
          <Text variant="callout" color="secondary" style={{ paddingVertical: 12 }}>
            {t('Nothing yet. Tap Expense above to add your first one.')}
          </Text>
        ) : null}
        {(txs.data?.items ?? []).slice(0, 5).map((tx, i, list) => {
          const income = tx.direction === 'in' && tx.category !== 'transfer';
          return (
            <SlateRow
              key={tx.id}
              icon={income ? 'plus' : categoryIcon[tx.category]}
              title={tx.description}
              subtitle={`${formatTime(tx.occurredAt)} · ${sourceLabel[tx.source]}${tx.familyId ? ` · ${t('Family')}` : ''}`}
              last={i === list.length - 1}
              right={
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text variant="callout" weight="600" tabular color={income ? c.positive : tx.category === 'transfer' ? c.secondary : c.label}>
                    {tx.direction === 'in' ? '+' : tx.category === 'transfer' ? '' : '−'}
                    {formatAmount(tx.amount, cur)}
                  </Text>
                  {tx.original ? (
                    <Text variant="footnote" color="secondary" tabular>
                      {formatMoney(tx.original.amount, tx.original.currency)}
                    </Text>
                  ) : null}
                </View>
              }
            />
          );
        })}
      </View>
    </SlatePage>
  );
}
