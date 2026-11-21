import type { AgentAction } from '@femate/shared';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { HeroHeader, Notice, SectionTitle } from '@/components/slate';
import { TAB_BAR_SPACE } from '@/components/PillTabBar';
import { Button, font, haptic, IconTile, LoadingDots, PressableScale, Text } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useCurrency } from '@/lib/currency';
import { formatAmount, formatMoney } from '@/lib/format';
import { useActions, useApplyRecommendation, useChat, useInsight, usePermissions, useRecommendations } from '@/lib/queries';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

interface Msg {
  id: string;
  who: 'user' | 'agent';
  text: string;
  action?: AgentAction;
}

// The floating pill tab bar sits above the safe-area inset.
const TAB_BAR = TAB_BAR_SPACE;
// t('Read-only') t('Advisor') t('Co-pilot') t('Autopilot')
const levelName = { L0: 'Read-only', L1: 'Advisor', L2: 'Co-pilot', L3: 'Autopilot' } as const;
const recIcon: Record<string, IconName> = { rec_bus: 'bus', rec_food: 'food' };

export default function Assistant() {
  const cur = useCurrency();
  const { c, dark } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const recs = useRecommendations();
  const insight = useInsight();
  const apply = useApplyRecommendation();
  const chat = useChat();
  const perms = usePermissions();
  const pending = useActions('pending');
  const [hidden, setHidden] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const kb = useKeyboardHeight();
  const scroll = useRef<ScrollView>(null);

  // Start the conversation with the action the agent is already waiting on.
  const level = perms.data?.level;
  useEffect(() => {
    const first = pending.data?.find((a) => a.type === 'transfer_to_savings');
    if (msgs.length === 0 && first && level) {
      setMsgs([
        {
          id: 'm0',
          who: 'agent',
          text: t('I’d like to move {amount} to Savings. You’re on {level} {name}, so it waits for your approval.', {
            amount: formatMoney(first.amount ?? 0, cur),
            level,
            name: t(levelName[level]),
          }),
          action: first,
        },
      ]);
    }
  }, [pending.data, msgs.length, cur, level, t]);
  const pendingIds = new Set((pending.data ?? []).map((a) => a.id));
  const [applyError, setApplyError] = useState<string | null>(null);

  // Another screen can open the chat with a question (Reports → "Make this a plan").
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  useEffect(() => {
    if (!ask) return;
    router.setParams({ ask: undefined });
    void send(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  // Keep the newest message in view when the keyboard opens.
  useEffect(() => {
    if (kb > 0) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  }, [kb]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || chat.isPending) return;
    setDraft('');
    const userMsg: Msg = { id: `u${Date.now()}`, who: 'user', text: q };
    setMsgs((m) => [...m, userMsg]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await chat.mutateAsync(q);
      if (res.actions.some((a) => a.status === 'blocked')) haptic('warning');
      setMsgs((m) => [...m, { id: `a${Date.now()}`, who: 'agent', text: res.reply, action: res.actions[0] }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: `e${Date.now()}`, who: 'agent', text: errorMessage(e) }]);
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const composerBottom = kb > 0 ? kb : insets.bottom + TAB_BAR;
  const visibleRecs = (recs.data ?? []).filter((r) => !hidden.includes(r.id) && r.status !== 'dismissed');
  const over = insight.data?.status === 'over';

  const applyRec = async (id: string) => {
    setApplyError(null);
    try {
      const res = await apply.mutateAsync(id);
      haptic('success');
      if (res.action?.status === 'pending') router.push({ pathname: '/action/[id]', params: { id: res.action.id } });
      else if (res.action?.status === 'blocked') setApplyError(res.action.reason);
    } catch (e) {
      haptic('warning');
      setApplyError(errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingBottom: composerBottom + 92, flexGrow: 1 }}
      >
        {/* Hero: who you're talking to, and today's check-in in one line (the full check-in lives on Today). */}
        <HeroHeader title={t('Assistant')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="bot" size={22} color={c.onBrand} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="headline" color="#FFFFFF">
                {t('Your money co-pilot')}
              </Text>
              <Text variant="footnote" color="rgba(255,255,255,0.6)" numberOfLines={1}>
                {t('Based on your last 14 days')} · {perms.data?.agentEnabled === false ? t('agent stopped') : (perms.data?.level ?? '…')}
              </Text>
            </View>
          </View>
          {insight.data ? (
            <PressableScale
              onPress={() => router.navigate('/(tabs)')}
              accessibilityRole="button"
              accessibilityLabel={`${over ? t('Over plan') : t('On track')}. ${insight.data.headline}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 9,
                  height: 24,
                  borderRadius: 12,
                  justifyContent: 'center',
                  backgroundColor: over ? '#F5B65C' : c.brand,
                }}
              >
                <Text variant="caption" weight="700" color="#000000">
                  {over ? t('Over plan') : t('On track')}
                </Text>
              </View>
              <Text variant="footnote" color="rgba(255,255,255,0.85)" numberOfLines={2} style={{ flex: 1 }}>
                {insight.data.headline}
              </Text>
            </PressableScale>
          ) : null}
        </HeroHeader>

        {/* Ideas: small cards in one swipeable row instead of a stack of long ones. */}
        {visibleRecs.length ? (
          <View style={{ paddingTop: 22, gap: 12 }}>
            <View style={{ paddingHorizontal: 20 }}>
              <SectionTitle title={t('Ideas for you')} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
              {visibleRecs.map((r) => (
                <View key={r.id} style={{ width: 250, backgroundColor: c.card, borderRadius: 22, padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <IconTile name={recIcon[r.id] ?? 'bulb'} bg={c.brand} fg={c.onBrand} size={36} iconSize={18} />
                    <Text variant="footnote" color="positive" weight="700" tabular style={{ flex: 1 }} numberOfLines={1}>
                      {t('Save {amount} a month', { amount: formatMoney(r.monthlySaving, cur) })}
                    </Text>
                    {r.status !== 'applied' ? (
                      <PressableScale
                        onPress={() => setHidden((h) => [...h, r.id])}
                        accessibilityRole="button"
                        accessibilityLabel={t('Not now')}
                        hitSlop={8}
                        style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Icon name="x" size={14} color={c.secondary} strokeWidth={2.4} />
                      </PressableScale>
                    ) : null}
                  </View>
                  <Text variant="callout" weight="600" numberOfLines={2} style={{ minHeight: 42 }}>
                    {r.title}
                  </Text>
                  {r.status === 'applied' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36 }}>
                      <Icon name="check" size={15} color={c.positiveInk} strokeWidth={2.6} />
                      <Text variant="footnote" color="positiveInk" weight="600">
                        {r.actionType ? t('Sent for your approval') : t('Reminder set')}
                      </Text>
                    </View>
                  ) : (
                    <Button
                      title={t('Apply')}
                      size="small"
                      loading={apply.isPending && apply.variables === r.id}
                      disabled={apply.isPending}
                      onPress={() => void applyRec(r.id)}
                    />
                  )}
                </View>
              ))}
            </ScrollView>
            {applyError ? (
              <View style={{ paddingHorizontal: 20 }}>
                <Notice text={applyError} />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 22, gap: 14 }}>
          {/* Until the first message the chat area stays empty on purpose: the screen is already full. */}
          {msgs.map((m) => {
            const me = m.who === 'user';
            // A pending action decided since (here, in Agent or in Telegram) drops its Review card.
            const a = m.action?.status === 'pending' && !pendingIds.has(m.action.id) ? undefined : m.action;
            return (
              <View
                key={m.id}
                style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', justifyContent: me ? 'flex-end' : 'flex-start' }}
              >
                {!me ? <IconTile name="bot" bg={c.brand} fg={c.onBrand} size={28} iconSize={15} /> : null}
                <View style={{ maxWidth: '80%', gap: 6, alignItems: me ? 'flex-end' : 'flex-start' }}>
                  <View
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      borderBottomRightRadius: me ? 6 : 20,
                      borderBottomLeftRadius: me ? 20 : 6,
                      backgroundColor: me ? c.accent : c.card,
                    }}
                  >
                    <Text variant="body" color={me ? c.onAccent : c.label} selectable>
                      {m.text}
                    </Text>
                  </View>
                  {a && a.status === 'pending' ? (
                    <PressableScale
                      onPress={() => router.push({ pathname: '/action/[id]', params: { id: a.id } })}
                      accessibilityRole="button"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        paddingHorizontal: 14,
                        borderRadius: 18,
                        backgroundColor: c.warnTint,
                      }}
                    >
                      <Icon name="transfer" size={20} color={c.warnInk} strokeWidth={2} />
                      <View style={{ flex: 1 }}>
                        <Text variant="callout" weight="600" tabular numberOfLines={1} adjustsFontSizeToFit>
                          {t('Card → Savings · {amount}', { amount: formatAmount(a.amount ?? 0, cur) })}
                        </Text>
                        <Text variant="footnote" color="warnInk">
                          {t('Pending your approval')}
                        </Text>
                      </View>
                      <Text variant="callout" color="warnInk" weight="600">
                        {t('Review')}
                      </Text>
                    </PressableScale>
                  ) : null}
                  {a && a.status === 'blocked' ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: c.dangerTint,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 8,
                      }}
                    >
                      <Icon name="ban" size={12} color={c.dangerInk} strokeWidth={2.6} />
                      <Text variant="caption" color="dangerInk" weight="600">
                        {t('Blocked by policy · {code}', { code: a.reason.split(':')[0] ?? '' })}
                      </Text>
                    </View>
                  ) : null}
                  {a && a.status === 'executed' ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: c.positiveTint,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 8,
                      }}
                    >
                      <Icon name="check" size={12} color={c.positiveInk} strokeWidth={2.6} />
                      <Text variant="caption" color="positiveInk" weight="600">
                        {t('Done automatically')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
          {chat.isPending ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }} accessibilityLabel={t('Thinking…')}>
              <IconTile name="bot" bg={c.brand} fg={c.onBrand} size={28} iconSize={15} />
              <View
                style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: c.card }}
              >
                <LoadingDots color={c.secondary} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Composer: a clearly outlined field on a soft grey fill, and a lime send button. */}
      <BlurView
        intensity={60}
        tint={dark ? 'dark' : 'light'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: composerBottom,
          paddingVertical: 10,
          backgroundColor: c.material,
          borderTopWidth: 1,
          borderTopColor: c.separator,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12 }}>
          <TextInput
            accessibilityLabel={t('Message FeMate')}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('Ask about your money…')}
            placeholderTextColor={c.secondary}
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              {
                flex: 1,
                height: 52,
                paddingHorizontal: 20,
                borderRadius: 26,
                borderWidth: 1.5,
                borderColor: focused ? c.label : c.fill2,
                backgroundColor: c.card,
                color: c.label,
                fontSize: 16,
              },
              font('400'),
            ]}
          />
          <PressableScale
            onPress={() => send(draft)}
            accessibilityRole="button"
            accessibilityLabel={t('Send')}
            disabled={!draft.trim()}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: draft.trim() ? c.brand : c.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrowUp" size={20} color={draft.trim() ? c.onBrand : c.secondary} strokeWidth={2.4} />
          </PressableScale>
        </View>
      </BlurView>
    </View>
  );
}
