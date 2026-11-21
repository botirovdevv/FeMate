import { fromUzs, type CardAuthorization, type CardDetails, type PaymentCard } from '@femate/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon, type IconName } from '@/components/Icon';
import { CircleAction, HeroHeader, PillButton, SectionTitle, SlateLoading, SlatePage, SlateRow, StatRows } from '@/components/slate';
import { Banner, ErrorRow, haptic, PressableScale, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { categoryIcon } from '@/lib/categories';
import { useCurrency } from '@/lib/currency';
import { formatMoney, formatTime } from '@/lib/format';
import { useAccounts, useCard, useCardAuthorizations, useFamily, useIssueCard, useSimulatePurchase, useUpdateCard } from '@/lib/queries';
import { useTheme } from '@/theme';

// Test purchases for the sandbox card: amounts in UZS, shown in the user's currency.
const SHOPS: { merchant: string; uzs: number; mcc: string; icon: IconName }[] = [
  { merchant: 'Evos', uzs: 45_000, mcc: '5814', icon: 'food' },
  { merchant: 'Yandex Go', uzs: 22_000, mcc: '4121', icon: 'transport' },
  { merchant: 'Korzinka', uzs: 180_000, mcc: '5411', icon: 'shopping' },
  { merchant: 'Uzum Market', uzs: 3_000_000, mcc: '5311', icon: 'shopping' },
];

const DECLINE_LABEL: Record<string, string> = {
  CARD_PAUSED: 'Card frozen',
  INSUFFICIENT_FUNDS: 'Not enough money',
  VELOCITY_EXCEEDED: 'Over budget',
  UNAUTHORIZED_MERCHANT: 'Declined',
};

const groupPan = (pan: string) => pan.replace(/(\d{4})(?=\d)/g, '$1 ');

/** Brushed-metal card face (reference design): silver, dark ink, contactless mark, VISA bottom right. */
function CardFace({ card, details }: { card: PaymentCard; details: CardDetails | null }) {
  const ink = card.frozen ? '#5A5A5E' : '#1A1A1A';
  const soft = card.frozen ? '#76767A' : '#4A4A4C';
  const [w, setW] = useState(340);
  return (
    <View
      accessibilityLabel={`${card.network === 'VISA' ? 'Visa' : 'Mastercard'} card ending in ${card.lastFour}${card.frozen ? ', frozen' : ''}`}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ width: '100%', maxWidth: 420, alignSelf: 'center', aspectRatio: 1.586, borderRadius: 22, overflow: 'hidden' }}
    >
      <Svg width={w} height={w / 1.586} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={card.frozen ? '#9A9A9C' : '#D9D7D2'} />
            <Stop offset="0.45" stopColor={card.frozen ? '#B4B4B6' : '#BEBBB4'} />
            <Stop offset="1" stopColor={card.frozen ? '#8C8C8E' : '#A9A6A0'} />
          </LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#metal)" />
        <Rect width="100%" height="100%" fill="url(#sheen)" />
      </Svg>
      <View style={{ flex: 1, padding: 22, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text variant="caption" color={soft} weight="600" style={{ letterSpacing: 2 }}>
            FEMATE · VIRTUAL
          </Text>
          <Icon name="wave" size={26} color={ink} strokeWidth={1.8} />
        </View>
        {card.frozen ? (
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.72)' }}>
            <Icon name="lock" size={14} color="#FFFFFF" strokeWidth={2.2} />
            <Text variant="footnote" color="#FFFFFF" weight="600">
              Frozen
            </Text>
          </View>
        ) : (
          <Text selectable={!!details} variant="title2" color={ink} tabular style={{ letterSpacing: 2, fontSize: 20 }}>
            {details ? groupPan(details.pan) : `•••• •••• •••• ${card.lastFour}`}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', gap: 22 }}>
            <View>
              <Text variant="caption" color={soft}>
                Expires
              </Text>
              <Text variant="callout" color={ink} weight="600" tabular>
                {card.expMonth}/{card.expYear.slice(-2)}
              </Text>
            </View>
            <View>
              <Text variant="caption" color={soft}>
                CVV
              </Text>
              <Text selectable={!!details} variant="callout" color={ink} weight="600" tabular>
                {details ? details.cvv : '•••'}
              </Text>
            </View>
          </View>
          <Text color={ink} weight="800" style={{ fontSize: 26, fontStyle: 'italic', letterSpacing: 0.5 }}>
            {card.network === 'VISA' ? 'VISA' : 'mastercard'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function AuthorizationRow({ a, last }: { a: CardAuthorization; last: boolean }) {
  const { c } = useTheme();
  const cur = useCurrency();
  return (
    <SlateRow
      icon={categoryIcon[a.category]}
      title={a.merchant}
      subtitle={`${a.approved ? 'Approved' : (DECLINE_LABEL[a.result] ?? 'Declined')} · ${formatTime(a.createdAt)}`}
      last={last}
      right={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text
            variant="callout"
            weight="600"
            tabular
            color={a.approved ? c.label : c.danger}
            style={a.approved ? undefined : { textDecorationLine: 'line-through' }}
          >
            −{formatMoney(a.amount, cur)}
          </Text>
          {a.original ? (
            <Text variant="footnote" color="secondary" tabular>
              {formatMoney(a.original.amount, a.original.currency)}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}

/** Setting row with a switch (reference "Card settings"). */
function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.separator, opacity: disabled ? 0.45 : 1 }}>
      <Icon name={icon} size={21} color={c.label} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="500">
          {title}
        </Text>
        <Text variant="footnote" color="secondary">
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: c.accent, false: c.fill2 }}
        thumbColor={value ? c.onAccent : undefined}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function CardScreen() {
  const { c } = useTheme();
  const cur = useCurrency();
  const status = useCard();
  const auths = useCardAuthorizations();
  const issue = useIssueCard();
  const update = useUpdateCard();
  const simulate = useSimulatePurchase();
  const [details, setDetails] = useState<CardDetails | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CardAuthorization | null>(null);

  const card = status.data?.card ?? null;
  const family = useFamily().data;
  const funding = useAccounts().data?.find((a) => a.id === card?.accountId);

  const reveal = async () => {
    if (details) return setDetails(null);
    setError(null);
    setRevealing(true);
    try {
      setDetails(await api.cardDetails());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRevealing(false);
    }
  };

  const toggle = (b: { frozen?: boolean; blockOverBudget?: boolean; payFromFamily?: boolean }) => {
    haptic('light');
    setError(null);
    update.mutate(b, { onError: (e) => setError(errorMessage(e)) });
  };

  const buy = (s: (typeof SHOPS)[number]) => {
    setError(null);
    setLast(null);
    simulate.mutate(
      { amount: fromUzs(s.uzs, cur), merchant: s.merchant, mcc: s.mcc },
      {
        onSuccess: (r) => {
          haptic(r.authorization.approved ? 'success' : 'warning');
          setLast(r.authorization);
          void auths.refetch();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <SlatePage
      refreshing={status.isRefetching || auths.isRefetching}
      onRefresh={() => void Promise.all([status.refetch(), auths.refetch()])}
      hero={
        <HeroHeader title="Card" back>
          {card ? (
            <>
              <CardFace card={card} details={details} />
              <View style={{ gap: 2 }}>
                <Text variant="headline" color="#FFFFFF">
                  FeMate card
                </Text>
                <Text variant="footnote" color="rgba(255,255,255,0.56)" tabular>
                  Virtual · •••• {card.lastFour}
                  {card.frozen ? ' · Frozen' : ''}
                  {card.payFromFamily ? ' · Family budget' : ''}
                </Text>
              </View>
            </>
          ) : null}
        </HeroHeader>
      }
    >
      {status.isError ? <ErrorRow message="Couldn’t load your card." onRetry={() => void status.refetch()} /> : null}
      {status.isLoading ? <SlateLoading /> : null}

      {status.data && !status.data.available ? (
        <Banner tone="warn" icon="info" title="The card isn’t switched on yet" subtitle="This server has no card provider set up. Try again later." />
      ) : null}

      {status.data?.available && !card ? (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text variant="title2">Get a virtual Visa card</Text>
            <Text variant="callout" color="body">
              Pay online with a FeMate card. It spends from your card account, and FeMate decides on every purchase the moment it happens.
            </Text>
          </View>
          <View>
            {(
              [
                ['shieldCheck', 'Checked live', 'Frozen card, balance and your category budgets.'],
                ['lock', 'Freeze in one tap', 'The full number is never stored by FeMate.'],
                ['list', 'Tracked for you', 'Purchases land in your history and reports on their own.'],
              ] as const
            ).map(([icon, title, text], i) => (
              <SlateRow key={icon} icon={icon} title={title} subtitle={text} last={i === 2} />
            ))}
          </View>
          <PillButton
            title="Get my FeMate card"
            icon="card"
            loading={issue.isPending}
            onPress={() => {
              setError(null);
              issue.mutate(undefined, { onSuccess: () => haptic('success'), onError: (e) => setError(errorMessage(e)) });
            }}
          />
          {status.data.sandbox ? (
            <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }}>
              Test card on the Lithic sandbox. It holds no real money.
            </Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Banner tone="danger" icon="info" title={error} /> : null}

      {card ? (
        <>
          <View style={{ flexDirection: 'row' }}>
            <CircleAction icon="lock" label={card.frozen ? 'Unfreeze' : 'Freeze'} active={card.frozen} onPress={() => toggle({ frozen: !card.frozen })} />
            <CircleAction icon={details ? 'eyeOff' : 'eye'} label={details ? 'Hide' : 'Details'} onPress={() => void reveal()} disabled={revealing} />
            <CircleAction icon="plus" label="Top up" onPress={() => router.push({ pathname: '/money', params: { mode: 'add', to: 'card' } })} />
            <CircleAction icon={family ? 'family' : 'target'} label={family ? 'Family' : 'Budgets'} onPress={() => router.push(family ? '/family' : '/settings')} />
          </View>
          {revealing ? <SlateLoading /> : null}

          <StatRows
            rows={[
              { label: 'Paid from', value: funding?.name ?? 'Card' },
              { label: 'Available to spend', value: formatMoney(funding?.balance ?? 0, cur), strong: true },
            ]}
          />

          <View>
            <SectionTitle title="Card settings" />
            <Text variant="footnote" color="secondary" style={{ marginTop: 4, marginBottom: 4 }}>
              {card.frozen ? 'Unfreeze the card to change these.' : 'Frozen cards and low balances are always declined.'}
            </Text>
            <SettingRow
              icon="target"
              title="Block over-budget purchases"
              subtitle="Decline what would take a category past its monthly budget"
              value={card.blockOverBudget}
              onChange={(v) => toggle({ blockOverBudget: v })}
              disabled={card.frozen}
              last={!family && !card.payFromFamily}
            />
            {family || card.payFromFamily ? (
              <SettingRow
                icon="family"
                title="Pay from family budget"
                subtitle={
                  family
                    ? `Counts against ${family.family.name}: declined past its budget${
                        family.role === 'member'
                          ? `, and over ${formatMoney(family.family.approvalThreshold, family.family.currency)} unless ${family.family.managerName} approved it first`
                          : ''
                      }`
                    : 'You left the family, so this is off'
                }
                value={card.payFromFamily}
                onChange={(v) => toggle({ payFromFamily: v })}
                disabled={card.frozen}
                last
              />
            ) : null}
          </View>

          {status.data?.sandbox ? (
            <View style={{ gap: 12 }}>
              <SectionTitle title="Try a purchase" />
              <Text variant="footnote" color="secondary">
                Sandbox: a shop charges your card through the card network, and FeMate approves or declines it live.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SHOPS.map((sh) => (
                  <View key={sh.merchant} style={{ flexGrow: 1, flexBasis: '45%' }}>
                    <PressableScale
                      disabled={simulate.isPending}
                      onPress={() => buy(sh)}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay ${formatMoney(fromUzs(sh.uzs, cur), cur)} at ${sh.merchant}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: c.card, opacity: simulate.isPending ? 0.6 : 1 }}
                    >
                      <Icon name={sh.icon} size={20} color={c.label} />
                      <View style={{ flex: 1 }}>
                        <Text variant="callout" weight="600" numberOfLines={1}>
                          {sh.merchant}
                        </Text>
                        <Text variant="footnote" color="secondary" tabular numberOfLines={1}>
                          {formatMoney(fromUzs(sh.uzs, cur), cur)}
                        </Text>
                      </View>
                    </PressableScale>
                  </View>
                ))}
              </View>
              {simulate.isPending ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color={c.secondary} />
                  <Text variant="footnote" color="secondary">
                    Waiting for the card network…
                  </Text>
                </View>
              ) : null}
              {last ? (
                <Banner
                  tone={last.approved ? 'success' : 'danger'}
                  icon={last.approved ? 'check' : 'ban'}
                  title={last.approved ? `Approved · ${formatMoney(last.amount, cur)}` : (DECLINE_LABEL[last.result] ?? 'Declined')}
                  subtitle={last.reason}
                />
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: 4 }}>
            <SectionTitle title="Card activity" />
            {auths.isError ? <ErrorRow message="Couldn’t load card activity." onRetry={() => void auths.refetch()} /> : null}
            {auths.data?.length === 0 ? (
              <Text variant="callout" color="secondary" style={{ paddingVertical: 12 }}>
                No purchases yet. Approved and declined payments show up here.
              </Text>
            ) : null}
            {(auths.data ?? []).map((a, i, all) => (
              <AuthorizationRow key={a.id} a={a} last={i === all.length - 1} />
            ))}
          </View>
        </>
      ) : null}
    </SlatePage>
  );
}
