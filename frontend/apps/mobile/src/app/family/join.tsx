import { router } from 'expo-router';
import { useState } from 'react';

import { CodeDigits, Notice, PillButton, SheetBody, TextField } from '@/components/slate';
import { haptic } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useJoinFamily } from '@/lib/queries';

// Same alphabet as the server: no 0/O or 1/I.
const clean = (t: string) => t.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6);

export default function JoinFamilySheet() {
  const join = useJoinFamily();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (code.length !== 6 || join.isPending) return;
    setError(null);
    try {
      await join.mutateAsync(code);
      haptic('success');
      router.replace('/family');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    }
  };

  return (
    <SheetBody title="Join a family" note="Ask the parent who manages the family for their 6-character invite code. It works once, for 24 hours.">
      <CodeDigits value={code} />
      <TextField
        label="Invite code"
        value={code}
        onChange={(t) => {
          setCode(clean(t));
          setError(null);
        }}
        placeholder="e.g. K7M2QX"
        autoCapitalize="characters"
        autoFocus
        maxLength={8}
        onSubmit={() => void submit()}
      />
      {error ? <Notice text={error} /> : null}
      <PillButton title="Join family" onPress={() => void submit()} loading={join.isPending} disabled={code.length !== 6} />
    </SheetBody>
  );
}
