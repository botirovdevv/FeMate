import type { Category, Transaction } from '@femate/shared';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SectionTitle, SlateRow } from '@/components/slate';
import { Chip, ErrorRow, Text } from '@/components/ui';
import { categoryIcon, sourceLabel } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney } from '@/lib/format';
import { useAllTransactions } from '@/lib/queries';
import { useTheme } from '@/theme';

function dayTitle(d: Date, now = new Date()) {
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const hm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Transactions() {
  const cur = useCurrency();
  const { c } = useTheme();
  const txs = useAllTransactions();
  const [filter, setFilter] = useState<Category | 'all'>('all');

  const cats = useMemo(() => [...new Set((txs.data?.items ?? []).map((t) => t.category))], [txs.data]);
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; total: number; items: Transaction[] }>();
    for (const t of txs.data?.items ?? []) {
      if (filter !== 'all' && t.category !== filter) continue;
      const d = new Date(t.occurredAt);
      const k = d.toDateString();
      const g = map.get(k) ?? { title: dayTitle(d), total: 0, items: [] };
      g.items.push(t);
      if (t.direction === 'out' && t.category !== 'transfer') g.total += t.amount;
      map.set(k, g);
    }
    return [...map.values()];
  }, [txs.data, filter]);

  const shownOut = groups.reduce((n, g) => n + g.total, 0);
  return (
    <Screen
      title="Transactions"
      refreshing={txs.isRefetching}
      onRefresh={() => void txs.refetch()}
      back
      hero={
        <View style={{ gap: 2 }}>
          <Text variant="footnote" color="rgba(255,255,255,0.56)" style={{ fontSize: 14 }}>
            {filter === 'all' ? 'Spent in this list' : `Spent on ${categoryLabel[filter].toLowerCase()}`}
          </Text>
          <Text variant="largeTitle" color="#FFFFFF" tabular style={{ fontSize: 40, lineHeight: 48, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(shownOut, cur)}
          </Text>
        </View>
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }}>
        <View style={{ width: 12 }} />
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {cats.map((cat) => (
          <Chip key={cat} label={categoryLabel[cat]} icon={categoryIcon[cat]} selected={filter === cat} onPress={() => setFilter(cat)} />
        ))}
        <View style={{ width: 12 }} />
      </ScrollView>

      {txs.isLoading ? <ActivityIndicator color={c.secondary} style={{ paddingVertical: 24 }} /> : null}
      {txs.isError ? <ErrorRow message="Couldn’t load your transactions." onRetry={() => void txs.refetch()} /> : null}
      {!txs.isLoading && groups.length === 0 && !txs.isError ? (
        <Text variant="callout" color="secondary" style={{ textAlign: 'center', paddingVertical: 24 }}>
          Nothing here yet.
        </Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.title}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle title={g.title} />
            {g.total > 0 ? (
              <Text variant="footnote" color="secondary" tabular>
                −{formatAmount(g.total, cur)}
              </Text>
            ) : null}
          </View>
          {g.items.map((t, i) => {
            const income = t.direction === 'in' && t.category !== 'transfer';
            return (
              <SlateRow
                key={t.id}
                icon={income ? 'plus' : categoryIcon[t.category]}
                title={t.description}
                subtitle={`${categoryLabel[t.category]} · ${hm(t.occurredAt)} · ${sourceLabel[t.source]}${t.familyId ? ' · Family' : ''}`}
                last={i === g.items.length - 1}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="callout" weight="600" tabular color={income ? c.positive : t.category === 'transfer' ? c.secondary : c.label}>
                      {t.direction === 'in' ? '+' : t.category === 'transfer' ? '' : '−'}
                      {formatAmount(t.amount, cur)}
                    </Text>
                    {t.original ? (
                      <Text variant="footnote" color="secondary" tabular>
                        {formatMoney(t.original.amount, t.original.currency)}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </View>
      ))}
      {txs.data?.nextCursor ? (
        <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
          Showing your latest {txs.data.items.length}. Older ones are in Reports.
        </Text>
      ) : null}
    </Screen>
  );
}
