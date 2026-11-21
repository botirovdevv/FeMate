import { router } from 'expo-router';
import { View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { useFamily } from '@/lib/queries';
import { Icon } from './Icon';
import { SlateProgress, useSlate } from './slate';
import { PressableScale, Text } from './ui';

/** Compact family budget on Today (Slate hero style). Hidden when the user has no family. */
export function FamilySummary() {
  const family = useFamily();
  const s = useSlate();
  const o = family.data;
  if (!o) return null;
  const cur = o.family.currency;
  const waiting = o.role === 'manager' ? o.requests.filter((r) => r.status === 'pending').length : 0;
  return (
    <PressableScale
      onPress={() => router.push('/family')}
      accessibilityRole="button"
      accessibilityLabel={`${o.family.name}: ${formatMoney(o.budget.remaining, cur)} left this month${waiting ? `, ${waiting} waiting for approval` : ''}`}
      style={{ backgroundColor: s.heroBg, borderRadius: 24, padding: 18, gap: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: s.heroButton, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="family" size={18} color={s.heroText} />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: s.heroText }} numberOfLines={1}>
          {o.family.name}
        </Text>
        {waiting ? (
          <View style={{ backgroundColor: s.heroText, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: s.heroBg }}>{waiting} to approve</Text>
          </View>
        ) : (
          <Icon name="chevronRight" size={18} color={s.heroMuted} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '600', color: s.heroText, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(o.budget.remaining, cur)}
        </Text>
        <Text style={{ fontSize: 13, color: s.heroMuted }}>left of {formatMoney(o.budget.limit, cur)}</Text>
      </View>
      <SlateProgress value={o.budget.limit > 0 ? o.budget.spent / o.budget.limit : 1} onHero height={6} />
    </PressableScale>
  );
}
