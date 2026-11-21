import { useEffect } from 'react';
import { Share, View } from 'react-native';

import { CodeDigits, Notice, PillButton, SheetBody, SlateLoading, useSlate } from '@/components/slate';
import { haptic, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useFamily, useFamilyInvite } from '@/lib/queries';
import { useT, weekdayTime } from '@/i18n';

export default function InviteSheet() {
  const s = useSlate();
  const family = useFamily();
  const invite = useFamilyInvite();
  const { t } = useT();
  const { mutate } = invite;
  // One fresh code each time the sheet opens.
  useEffect(() => mutate(), [mutate]);
  const error = invite.isError ? errorMessage(invite.error) : null;

  const code = invite.data?.code;
  const until = invite.data ? new Date(invite.data.expiresAt) : null;
  const name = family.data?.family.name ?? t('my family');

  return (
    <SheetBody title={t("Invite to the family")} note={t("They open FeMate on their own phone → Settings → Family → Join with a code.")}>
      {code ? <CodeDigits value={code} /> : error ? null : <SlateLoading />}
      {until ? (
        <Text style={{ textAlign: 'center', fontSize: 14, color: s.muted }}>
          {t('Works once, until {when}', { when: weekdayTime(until) })}
        </Text>
      ) : null}
      {error ? <Notice text={error} /> : null}
      <View style={{ gap: 12 }}>
        <PillButton
          title={t("Share code")}
          icon="share"
          disabled={!code}
          onPress={() => {
            haptic('light');
            void Share.share({ message: t('Join “{family}” on FeMate: open Settings → Family → Join with a code, and enter {code}. The code works once, for 24 hours.', { family: name, code: code ?? '' }) });
          }}
        />
        <PillButton title={t("New code")} icon="refresh" variant="secondary" loading={invite.isPending} onPress={() => mutate()} />
      </View>
    </SheetBody>
  );
}
