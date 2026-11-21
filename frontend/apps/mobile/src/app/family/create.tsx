import { fromUzs, niceStep } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AmountInput, Notice, PillButton, PillChip, SheetBody, StatRows, TextField, useSlate } from '@/components/slate';
import { haptic, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { amountInputValue, formatMoney, parseAmountInput, shortAmount } from '@/lib/format';
import { useCreateFamily, useMe } from '@/lib/queries';

export default function CreateFamilySheet() {
  const cur = useCurrency();
  const me = useMe();
  const create = useCreateFamily();
  const s = useSlate();
  const round = (uzs: number) => {
    const unit = niceStep(fromUzs(10_000, cur));
    return Math.round(fromUzs(uzs, cur) / unit) * unit;
  };
  const budgetPresets = [2_000_000, 3_000_000, 5_000_000, 8_000_000].map(round);
  const thresholdPresets = [100_000, 200_000, 500_000].map(round);
  const first = me.data?.name.split(' ')[0];
  const [name, setName] = useState(first ? `${first}’s family` : '');
  const [budget, setBudget] = useState(amountInputValue(budgetPresets[1]!, cur));
  const [threshold, setThreshold] = useState(thresholdPresets[1]!);
  const [error, setError] = useState<string | null>(null);
  const monthlyBudget = parseAmountInput(budget, cur);
  const ok = name.trim().length > 0 && monthlyBudget > 0 && threshold <= monthlyBudget;

  const submit = async () => {
    if (!ok || create.isPending) return;
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), monthlyBudget, approvalThreshold: threshold });
      haptic('success');
      router.replace('/family/invite');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  return (
    <SheetBody title="Create a family" note="You’ll manage it: set the budget, invite people and approve big spends.">
      <TextField label="Family name" value={name} onChange={setName} placeholder="e.g. The Karimovs" maxLength={60} />
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: s.text }}>Monthly budget</Text>
        <AmountInput value={budget} onChange={setBudget} currency={cur} label="Monthly budget" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {budgetPresets.map((p) => (
            <PillChip key={p} label={shortAmount(p, cur)} selected={p === monthlyBudget} onPress={() => setBudget(amountInputValue(p, cur))} />
          ))}
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: s.text }}>Ask me before a member spends more than</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {thresholdPresets.map((p) => (
            <PillChip key={p} label={shortAmount(p, cur)} selected={p === threshold} onPress={() => setThreshold(p)} />
          ))}
        </View>
      </View>
      <StatRows
        rows={[
          { label: 'Over budget', value: 'Blocked' },
          { label: 'Over the limit', value: `Waits for you (${formatMoney(threshold, cur)})` },
          { label: 'Members see', value: 'Totals only' },
        ]}
      />
      {threshold > monthlyBudget && monthlyBudget > 0 ? <Notice tone="warn" text="The approval limit can’t be above the budget." /> : null}
      {error ? <Notice text={error} /> : null}
      <PillButton title="Create family" onPress={() => void submit()} loading={create.isPending} disabled={!ok} />
    </SheetBody>
  );
}
