import { CURRENCIES, CURRENCY_INFO, VOICE_LANGUAGES, type Currency, type VoiceLanguage } from '@femate/shared';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { LogoMark } from '@/components/Logo';
import { HeroHeader, SlatePage } from '@/components/slate';
import { Button, Chip, haptic, IconTile, ListRow, PressableScale, SectionLabel, Text } from '@/components/ui';
import { api, errorMessage, usingMock } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { formatAmount } from '@/lib/format';
import { disableNotifications, enableNotifications, scheduleDailyReport } from '@/lib/notifications';
import { useDailySummary, useFamily, useMe, usePermissions, useUpdateMe } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useSettings, type Appearance } from '@/store/settings';
import { useTheme } from '@/theme';
import { LANGS, useT } from '@/i18n';
import { PopIn } from '@/components/motion';

const BOT_URL = 'https://t.me/femate_uz_bot';

const REPORT_TIMES = ['18:00', '19:00', '20:00', '20:30', '21:00', '21:30', '22:00', '23:00'];

// t('Auto-detect') t('System') t('Light') t('Dark') t('Uzbek so’m') t('US dollar') t('Euro') t('Russian ruble') t('Chinese yuan')
const VOICE_LABEL: Record<VoiceLanguage, string> = { auto: 'Auto-detect', ru: 'Русский', en: 'English' };

/** "1 USD = 12 100 UZS" at the fixed sandbox rates. */
const rate = (x: Currency) => `1 ${x} = ${formatAmount(CURRENCY_INFO[x].uzsRate, 'UZS')} UZS`;

const MODES: { id: Appearance; label: string; icon: IconName }[] = [
  { id: 'system', label: 'System', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

export default function Settings() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const me = useMe();
  const family = useFamily();
  const daily = useDailySummary();
  const perms = usePermissions();
  const { appearance, setAppearance, pushEnabled, serverPush, setPushEnabled, language, setLanguage } = useSettings();
  const { t } = useT();
  const signOut = useSession((s) => s.signOut);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const updateMe = useUpdateMe();
  const [picker, setPicker] = useState<'time' | 'currency' | 'voice' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const u = me.data;
  const reportTime = u?.reportTime ?? '21:00';

  const togglePush = async (on: boolean) => {
    haptic('light');
    setNotice(null);
    try {
      if (!on) {
        await disableNotifications();
        setPushEnabled(false);
        return;
      }
      const res = await enableNotifications(reportTime);
      if (!res.ok) {
        setNotice(res.reason);
        setPushEnabled(false);
        return;
      }
      setPushEnabled(true, res.pushToken);
      setNotice(
        res.pushToken
          ? t('You’ll get your daily report at {time} and alerts from the agent.', { time: reportTime })
          : t('You’ll get a reminder at {time}. Agent alerts also arrive in Telegram once it’s linked.', { time: reportTime }),
      );
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  // Each choice saves on the server; a failure is shown under the list instead of vanishing.
  const save = async (run: () => Promise<unknown>) => {
    haptic('light');
    setPicker(null);
    setNotice(null);
    try {
      await run();
    } catch (e) {
      setNotice(errorMessage(e));
    }
  };

  const chooseTime = (t: string) =>
    save(async () => {
      await updateMe.mutateAsync({ reportTime: t });
      if (pushEnabled) await scheduleDailyReport(t, serverPush);
    });

  // The server converts every stored amount; useUpdateMe refetches everything that shows money.
  const chooseCurrency = (x: Currency) => (x === cur ? save(async () => undefined) : save(() => updateMe.mutateAsync({ currency: x })));

  const chooseVoice = (v: VoiceLanguage) => save(() => updateMe.mutateAsync({ voiceLanguage: v }));

  const getCode = async () => {
    setCodeBusy(true);
    setNotice(null);
    try {
      setCode(await api.telegramLinkCode());
      haptic('success');
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setCodeBusy(false);
    }
  };

  // While a link code is on screen, check every few seconds whether the bot has linked the chat,
  // and drop the code once it expires.
  const [now, setNow] = useState(() => Date.now());
  const refetchMe = me.refetch;
  useEffect(() => {
    if (!code || me.data?.telegramLinked) return;
    const id = setInterval(() => {
      setNow(Date.now());
      void refetchMe();
    }, 4000);
    return () => clearInterval(id);
  }, [code, refetchMe, me.data?.telegramLinked]);
  const codeLeftMin = code ? Math.ceil((Date.parse(code.expiresAt) - now) / 60_000) : 0;
  // A code is done once it expires or the bot has linked the chat.
  const activeCode = code && codeLeftMin > 0 && !me.data?.telegramLinked ? code : null;

  const group = { backgroundColor: c.card, borderRadius: 22, overflow: 'hidden' as const };

  return (
    <SlatePage
      hero={
        <HeroHeader title={t('Profile')} back>
          <View style={{ alignItems: 'center', gap: 10, paddingBottom: 4 }}>
            {/* Avatar in a dashed ring, like the reference profile; it springs in. */}
            <PopIn>
              <View
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 46,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: c.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    backgroundColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="title" color="#000000" weight="600">
                    {(u?.name ?? 'A').charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>
            </PopIn>
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text variant="title2" color="#FFFFFF" numberOfLines={1}>
                {u?.name ?? '…'}
              </Text>
              <Text variant="footnote" color="rgba(255,255,255,0.56)" numberOfLines={1}>
                {u?.email}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
                backgroundColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <Icon name="shield" size={13} color="rgba(255,255,255,0.7)" strokeWidth={2} />
              <Text variant="caption" color="rgba(255,255,255,0.7)" weight="600">
                Agent level {perms.data?.level ?? '…'}
              </Text>
            </View>
          </View>
        </HeroHeader>
      }
    >
      <View>
        <SectionLabel>{t('Appearance')}</SectionLabel>
        <View style={{ ...group, padding: 12, flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
          {MODES.map((m) => {
            const on = appearance === m.id;
            // PressableScale's style lands inside its Pressable, so a wrapper takes the row's space.
            return (
              <View key={m.id} style={{ flex: 1 }}>
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setAppearance(m.id)}
                  style={{
                    borderWidth: 2,
                    borderColor: on ? c.accent : 'transparent',
                    borderRadius: 14,
                    paddingTop: 10,
                    paddingBottom: 8,
                    backgroundColor: c.fill,
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name={m.icon} size={24} color={c.label} />
                  <Text variant="footnote" weight="600" numberOfLines={1}>
                    {t(m.label)}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </View>

      <View>
        <SectionLabel>{t('Language')}</SectionLabel>
        <View style={{ ...group, padding: 6, flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup">
          {LANGS.map((l) => {
            const on = language === l.value;
            return (
              <View key={l.value} style={{ flex: 1 }}>
                <PressableScale
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={l.label}
                  onPress={() => setLanguage(l.value)}
                  style={{
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: on ? c.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="footnote" weight="600" color={on ? c.onAccent : c.label} numberOfLines={1}>
                    {l.label}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
      </View>

      <View>
        <SectionLabel>{t('Money and voice')}</SectionLabel>
        <View style={group}>
          <ListRow icon="cash" tile="#0E7A4B" title={t('Currency')} value={cur} onPress={() => setPicker('currency')} />
          <ListRow
            icon="mic"
            tile="#AF52DE"
            title={t('Voice language')}
            value={t(VOICE_LABEL[u?.voiceLanguage ?? 'auto'])}
            onPress={() => setPicker('voice')}
            last
          />
        </View>
      </View>

      <View>
        <SectionLabel>{t('Budget')}</SectionLabel>
        <View style={group}>
          <ListRow
            icon="wallet"
            tile="#0E7A4B"
            title={t('Monthly income')}
            value={formatAmount(u?.monthlyIncome ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="home"
            tile="#FF9500"
            title={t('Fixed costs')}
            value={formatAmount(u?.fixedCostsMonthly ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="target"
            tile="#007AFF"
            title={t('Savings goal')}
            value={formatAmount(u?.savingsGoalMonthly ?? 0, cur)}
            onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'edit' } })}
          />
          <ListRow
            icon="gauge"
            tile="#30B0C7"
            title={t('Daily allowance')}
            value={formatAmount(daily.data?.dailyAllowance ?? 0, cur)}
            valueColor={c.accent}
            last
          />
        </View>
      </View>

      <View>
        <SectionLabel>{t('Notifications')}</SectionLabel>
        <View style={group}>
          <ListRow icon="clock" tile="#5856D6" title={t('Daily report')} value={reportTime} onPress={() => setPicker('time')} />
          <ListRow
            icon="bell"
            tile="#E5484D"
            title={t('Notifications')}
            last
            right={
              <Switch
                value={pushEnabled}
                onValueChange={togglePush}
                trackColor={{ true: '#34C759', false: c.fill2 }}
                accessibilityLabel={t('Notifications')}
              />
            }
          />
        </View>
        {notice ? (
          <Text variant="footnote" color="secondary" style={{ paddingHorizontal: 16, paddingTop: 8 }} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
      </View>

      <PickerSheet
        visible={picker === 'time'}
        onClose={() => setPicker(null)}
        title={t('Daily report time')}
        hint={t('FeMate sends your report to Telegram and as a notification at this time.')}
      >
        {REPORT_TIMES.map((time) => (
          <Chip key={time} label={time} icon="clock" selected={time === reportTime} onPress={() => void chooseTime(time)} />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={picker === 'currency'}
        onClose={() => setPicker(null)}
        title={t('Currency')}
        hint={t(
          'Balances, history, budgets and agent limits are converted at fixed sandbox rates ({rates}). You can still log an expense in any currency, like “coffee $4.50”.',
          {
            rates: CURRENCIES.filter((x) => x !== 'UZS')
              .map(rate)
              .join(', '),
          },
        )}
      >
        {CURRENCIES.map((x) => (
          <Chip key={x} label={`${x} · ${t(CURRENCY_INFO[x].name)}`} selected={x === cur} onPress={() => void chooseCurrency(x)} />
        ))}
      </PickerSheet>

      <PickerSheet
        visible={picker === 'voice'}
        onClose={() => setPicker(null)}
        title={t('Voice language')}
        hint={t(
          'What you speak in voice notes, in the app and in Telegram. Auto-detect works for most; pick one if short notes come out wrong.',
        )}
      >
        {VOICE_LANGUAGES.map((v) => (
          <Chip
            key={v}
            label={t(VOICE_LABEL[v])}
            icon="mic"
            selected={v === (u?.voiceLanguage ?? 'auto')}
            onPress={() => void chooseVoice(v)}
          />
        ))}
      </PickerSheet>

      <View>
        <SectionLabel>{t('Family')}</SectionLabel>
        <View style={group}>
          <ListRow
            icon="family"
            tile="#1C1C1E"
            title={t('Family budget')}
            value={family.data ? family.data.family.name : t('Set up')}
            last
            onPress={() => router.push('/family')}
          />
        </View>
      </View>

      <View>
        <SectionLabel>{t('FeMate card')}</SectionLabel>
        <View style={group}>
          <ListRow icon="card" tile="#0E7A4B" title={t('Virtual card')} last onPress={() => router.push('/card')} />
        </View>
      </View>

      <View>
        <SectionLabel>{t('Telegram bot')}</SectionLabel>
        <View style={{ ...group, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <IconTile name="send" bg="#2AABEE" fg="#FFFFFF" size={30} iconSize={18} rounded={8} />
            <Text variant="callout" color="body" style={{ flex: 1 }}>
              {t(
                'Add expenses, forward bank SMS and get your daily report in Telegram. The bot can read and add, but it can never move money.',
              )}
            </Text>
          </View>
          {me.data?.telegramLinked && !activeCode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="check" size={16} color={c.accent} strokeWidth={2.4} />
              <Text variant="callout" style={{ flex: 1 }}>
                {t('Linked to @femate_uz_bot')}
              </Text>
              <Button title={t('Open')} variant="tinted" size="small" onPress={() => Linking.openURL(BOT_URL)} />
            </View>
          ) : activeCode ? (
            <View style={{ alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.fill }}>
              <Text selectable variant="largeTitle" tabular style={{ letterSpacing: 4, fontSize: 34 }}>
                {activeCode.code}
              </Text>
              <Text variant="footnote" color="body" style={{ textAlign: 'center', fontSize: 14 }} selectable>
                {t('Send /start {code} to @femate_uz_bot, or tap below.', { code: activeCode.code })}
              </Text>
              <Button
                title={t('Open in Telegram')}
                icon="send"
                size="medium"
                onPress={() => Linking.openURL(`${BOT_URL}?start=${activeCode.code}`)}
                style={{ borderRadius: 14, height: 44, alignSelf: 'stretch' }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="clock" size={12} color={c.secondary} strokeWidth={2.2} />
                <Text variant="caption" color="secondary">
                  {t('Expires in {n} min · waiting for the bot…', { n: codeLeftMin })}
                </Text>
              </View>
            </View>
          ) : (
            <Button
              title={t('Get a link code')}
              icon="link"
              variant="tinted"
              size="medium"
              onPress={getCode}
              loading={codeBusy}
              style={{ borderRadius: 14, height: 48 }}
            />
          )}
        </View>
      </View>

      <View style={group}>
        <ListRow
          icon="shieldCheck"
          tile="#0E7A4B"
          title={t('Agent permissions')}
          value={perms.data?.agentEnabled === false ? t('Stopped') : perms.data?.level}
          onPress={() => router.navigate('/activity')}
        />
        <ListRow
          icon="logout"
          tile={c.danger}
          title={t('Sign out')}
          destructive
          last
          onPress={async () => {
            // A shared phone must not keep getting this account's pushes.
            if (pushEnabled) {
              await disableNotifications().catch(() => undefined);
              setPushEnabled(false);
            }
            await signOut();
            router.replace('/login');
          }}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <LogoMark size={28} dark={dark} />
        <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>
          FeMate 0.1 · {usingMock ? t('demo data (no server)') : t('connected to server')}
        </Text>
      </View>
    </SlatePage>
  );
}

function PickerSheet({
  visible,
  onClose,
  title,
  hint,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t('Close')}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: c.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.fill2 }} />
          <Text variant="title2">{title}</Text>
          <Text variant="footnote" color="secondary">
            {hint}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
