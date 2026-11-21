import Slider from '@react-native-community/slider';
import { fromUzs, niceStep } from '@femate/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Notice, PillButton, PillChip, SheetBody, SlateLoading, useSlate } from '@/components/slate';
import { haptic, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatMoney, shortAmount } from '@/lib/format';
import { useFamily, useUpdateFamily } from '@/lib/queries';

// Presets in so'm, shown in the family's currency and rounded to a readable step.
const PRESETS = { budget: [1_000_000, 3_000_000, 5_000_000, 10_000_000], threshold: [100_000, 200_000, 500_000, 1_000_000] } as const;

/** Monthly budget or approval limit, Monthly-limit-sheet style: big number, slider, presets, save. */
export default function FamilyBudgetSheet() {
  const { field } = useLocalSearchParams<{ field?: string }>();
  const kind = field === 'threshold' ? 'threshold' : 'budget';
  const family = useFamily();
  const update = useUpdateFamily();
  const s = useSlate();
  const f = family.data?.family;
  const current = f ? (kind === 'budget' ? f.monthlyBudget : f.approvalThreshold) : 0;
  const [value, setValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!family.data || !f) return <SlateLoading />;
  const cur = f.currency;
  const unit = niceStep(fromUzs(kind === 'budget' ? 50_000 : 10_000, cur));
  const round = (n: number) => Math.round(n / unit) * unit;
  const presets = PRESETS[kind].map((uzs) => round(fromUzs(uzs, cur)));
  const max = Math.max(presets[presets.length - 1]! * 2, current * 2);
  const v = value ?? current;
  const spent = family.data.budget.spent;
  const tooLow = kind === 'budget' && v < spent;
  const invalid = kind === 'budget' ? v <= 0 : v < 0 || v > f.monthlyBudget;

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync(kind === 'budget' ? { monthlyBudget: v } : { approvalThreshold: v });
      haptic('success');
      router.back();
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  return (
    <SheetBody
      title={kind === 'budget' ? 'Monthly budget' : 'Approval limit'}
      note={
        kind === 'budget'
          ? `${f.name} · ${formatMoney(spent, cur)} spent so far`
          : 'A member’s family spend above this waits for your OK. Your own spends never do.'
      }
    >
      <Text
        accessibilityLiveRegion="polite"
        style={{ fontSize: 48, lineHeight: 56, fontWeight: '600', letterSpacing: -1, color: s.text, textAlign: 'center', fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {kind === 'threshold' && v === 0 ? 'Every spend' : formatMoney(v, cur)}
      </Text>
      <Slider
        accessibilityLabel={kind === 'budget' ? 'Monthly budget' : 'Approval limit'}
        value={v}
        minimumValue={0}
        maximumValue={max}
        step={unit}
        onValueChange={(n) => setValue(round(n))}
        onSlidingStart={() => haptic('light')}
        minimumTrackTintColor={s.primary}
        maximumTrackTintColor={s.secondaryBg}
        thumbTintColor={s.primary}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {presets.map((p) => (
          <PillChip key={p} label={shortAmount(p, cur)} selected={p === v} onPress={() => setValue(p)} />
        ))}
      </View>
      {tooLow ? <Notice tone="warn" text={`The family already spent ${formatMoney(spent, cur)} this month, so new family spends will be blocked.`} /> : null}
      {kind === 'threshold' && v > f.monthlyBudget ? <Notice tone="warn" text="The approval limit can’t be above the monthly budget." /> : null}
      {error ? <Notice text={error} /> : null}
      <PillButton title={kind === 'budget' ? 'Save budget' : 'Save limit'} onPress={() => void save()} loading={update.isPending} disabled={invalid || v === current} />
    </SheetBody>
  );
}
