import { router } from 'expo-router';
import { useState } from 'react';

import { AmountInput, Notice, PillButton, SheetBody, SlateLoading, StatRows, TextField } from '@/components/slate';
import { haptic } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatMoney, parseAmountInput } from '@/lib/format';
import { useFamily, useRequestFamilyCard } from '@/lib/queries';

/** A member asks ahead for a card purchase over the approval limit (the card network can't wait for a reply). */
export default function FamilyRequestSheet() {
  const family = useFamily();
  const ask = useRequestFamilyCard();
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const f = family.data?.family;
  if (!f || !family.data) return <SlateLoading />;
  const cur = f.currency;
  const minor = parseAmountInput(amount, cur);
  const ok = minor > f.approvalThreshold && minor <= family.data.budget.remaining && what.trim().length > 0;

  const submit = async () => {
    if (!ok || ask.isPending) return;
    setError(null);
    try {
      await ask.mutateAsync({ amount: minor, description: what.trim() });
      haptic('success');
      router.back();
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  return (
    <SheetBody
      title="Ask for approval"
      note={`For a card purchase over ${formatMoney(f.approvalThreshold, cur)}. When ${f.managerName} approves, your FeMate card pays up to this amount once, within 24 hours. Typed spends are sent for approval automatically.`}
    >
      <AmountInput value={amount} onChange={setAmount} currency={cur} label="Amount" autoFocus />
      <TextField label="What is it for?" value={what} onChange={setWhat} placeholder="e.g. Winter coat" maxLength={200} onSubmit={() => void submit()} />
      <StatRows
        rows={[
          { label: 'Left in the family budget', value: formatMoney(family.data.budget.remaining, cur) },
          { label: 'Needs approval over', value: formatMoney(f.approvalThreshold, cur) },
        ]}
      />
      {minor > 0 && minor <= f.approvalThreshold ? <Notice tone="info" text="This doesn’t need approval. Just pay from the family budget." /> : null}
      {minor > family.data.budget.remaining ? <Notice tone="warn" text="That’s more than is left in the family budget this month." /> : null}
      {error ? <Notice text={error} /> : null}
      <PillButton title={`Send to ${f.managerName}`} icon="send" onPress={() => void submit()} loading={ask.isPending} disabled={!ok} />
    </SheetBody>
  );
}
