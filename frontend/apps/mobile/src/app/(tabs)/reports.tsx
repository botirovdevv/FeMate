import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Button, Card, ErrorRow, haptic, IconTile, Segmented, Text } from '@/components/ui';
import { categoryIcon } from '@/lib/categories';
import { fromUzs, niceStep } from '@femate/shared';

import { useCurrency } from '@/lib/currency';
import { categoryLabel, formatAmount, formatMoney, shortAmount } from '@/lib/format';
import {
  bars as buildBars,
  categoryDeltas,
  changePct,
  offsetLabel,
  periodRange,
  previousRange,
  rangeLabel,
  type Period,
} from '@/lib/period';
import { useDailySummary, usePeriodSummary, useSimulate } from '@/lib/queries';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

const CHART_H = 156;

function WhatIfRow({
  icon,
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
  onDone,
}: {
  icon: IconName;
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onDone: (v: number) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={18} color={c.secondary} strokeWidth={1.9} />
          <Text variant="callout">{label}</Text>
        </View>
        <Text variant="callout" weight="600" tabular>
          {display}
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        onSlidingStart={() => haptic('light')}
        onSlidingComplete={(v) => onDone(Math.round(v))}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.fill2}
        thumbTintColor={Platform.OS === 'ios' ? '#FFFFFF' : c.accent}
        style={{ height: 36 }}
      />
    </View>
  );
}

export default function Reports() {
  const { t, tn } = useT();
  const cur = useCurrency();
  const { c } = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // Sliders move in so'm and show the user's currency, rounded to a readable step.
  const [taxi, setTaxi] = useState(20_000);
  const [alt, setAlt] = useState(4_000);
  const unit = niceStep(fromUzs(1000, cur));
  const inCur = (uzs: number) => Math.round(fromUzs(uzs, cur) / unit) * unit;
  const [days, setDays] = useState(15);
  const range = useMemo(() => periodRange(period, offset), [period, offset]);
  const prevRange = useMemo(() => previousRange(period, offset), [period, offset]);
  const summary = usePeriodSummary(range.from, range.to);
  const prevSummary = usePeriodSummary(prevRange.from, prevRange.to, compare);
  const daily = useDailySummary();
  const allowance = daily.data?.dailyAllowance ?? 0;

  const bars = useMemo(
    () => buildBars(period, range, new Map((summary.data?.byDay ?? []).map((d) => [d.date, d.amount]))),
    [summary.data, period, range],
  );
  const prevBars = useMemo(
    () =>
      compare
        ? buildBars(period, periodRange(period, offset + 1), new Map((prevSummary.data?.byDay ?? []).map((d) => [d.date, d.amount])))
        : [],
    [compare, prevSummary.data, period, offset],
  );

  const limit = period === 'week' ? allowance : allowance * 7;
  // At least 1, so a new account with no limit and no spending doesn't divide by zero.
  const max = Math.max(1, limit * 1.25, ...bars.map((b) => b.amount), ...prevBars.map((b) => b.amount));
  const total = bars.reduce((s, b) => s + b.amount, 0);
  const prevTotal = (prevSummary.data?.byDay ?? []).reduce((s, d) => s + d.amount, 0);
  const delta = compare && prevSummary.data ? changePct(total, prevTotal) : null;
  const overCount = bars.filter((b) => b.amount > limit).length;
  const todayIdx = bars.findIndex((b) => b.isToday);
  const sel = selected ?? (todayIdx >= 0 ? todayIdx : 0);
  const step = (by: number) => {
    haptic('light');
    setOffset((o) => Math.max(0, o + by));
    setSelected(null);
  };
  // Rules Engine owns the math (PLAN.md §9); the local value only fills in until the server answers.
  // Sliders update the local estimate live; the server (Rules Engine) is asked once the finger lifts.
  const [asked, setAsked] = useState({ taxi: 20_000, alt: 4_000, days: 15 });
  const sim = useSimulate(inCur(asked.taxi), inCur(asked.alt), asked.days);
  const settled = asked.taxi === taxi && asked.alt === alt && asked.days === days;
  const monthly = settled && sim.data ? sim.data.monthlySaving : Math.max(0, inCur(taxi) - inCur(alt)) * days;
  const yearly = settled && sim.data ? sim.data.yearlySaving : monthly * 12;
  const top = categoryDeltas(summary.data?.byCategory.slice(0, 4) ?? [], prevSummary.data?.byCategory ?? []);
  const vs =
    offset === 0
      ? period === 'week'
        ? t('vs the same days last week')
        : t('vs the same days last month')
      : period === 'week'
        ? t('vs the week before')
        : t('vs the month before');

  return (
    <Screen
      tabs
      title={t("Reports")}
      refreshing={summary.isRefetching}
      onRefresh={() => void summary.refetch()}
      hero={
        <View style={{ gap: 2 }}>
          <Text variant="footnote" color="rgba(255,255,255,0.56)" style={{ fontSize: 14 }}>
            {offset === 0 ? (period === 'week' ? t('Spent this week') : t('Spent this month so far')) : t('Spent: {period}', { period: offsetLabel(period, offset) })}
          </Text>
          <Text variant="largeTitle" color="#FFFFFF" tabular style={{ fontSize: 44, lineHeight: 52, letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(total, cur)}
          </Text>
          <Text variant="footnote" color="rgba(255,255,255,0.56)" tabular>
            {rangeLabel(period, range)}
          </Text>
        </View>
      }
    >
      <Segmented<Period>
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setOffset(0);
          setSelected(null);
        }}
        options={[
          { value: 'week', label: t('Week'), icon: 'calendar' },
          { value: 'month', label: t('Month'), icon: 'receipt' },
        ]}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <NavButton icon="chevronLeft" label={period === 'week' ? t('Previous week') : t('Previous month')} onPress={() => step(1)} />
        <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
          <Text variant="headline" tabular>
            {rangeLabel(period, range)}
          </Text>
          <Text variant="caption" color="secondary" weight="600">
            {offsetLabel(period, offset)}
          </Text>
        </View>
        {offset > 0 ? <NavButton icon="chevronRight" label={period === 'week' ? t('Next week') : t('Next month')} onPress={() => step(-1)} /> : <View style={{ width: 40 }} />}
      </View>

      <Card style={{ gap: 16 }}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="chart" size={14} color={c.secondary} strokeWidth={2.2} />
            <Text variant="footnote" color="secondary" weight="500" style={{ flex: 1 }}>
              {offset === 0
                ? period === 'week'
                  ? t('This week')
                  : t('This month so far')
                : t('Spent: {period}', { period: offsetLabel(period, offset) })}
            </Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: compare }}
              accessibilityLabel={period === 'week' ? t('Compare with the week before') : t('Compare with the month before')}
              onPress={() => {
                haptic('light');
                setCompare((v) => !v);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                height: 30,
                paddingHorizontal: 12,
                borderRadius: 15,
                backgroundColor: compare ? c.accent : c.fill,
              }}
            >
              <Icon name="transfer" size={14} color={compare ? c.onAccent : c.label} strokeWidth={2.2} />
              <Text variant="footnote" weight="600" style={{ color: compare ? c.onAccent : c.label }}>
                {t('Compare')}
              </Text>
            </Pressable>
          </View>
          {compare ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {delta !== null ? <DeltaPill pct={delta} /> : null}
              <Text variant="footnote" color="secondary" tabular>
                {prevSummary.isLoading ? t('Loading the period before…') : `${formatMoney(prevTotal, cur)} ${vs}`}
              </Text>
            </View>
          ) : null}
          <Text variant="footnote" color="secondary">
            {overCount === 0
              ? period === 'week'
                ? t('Under the daily limit every day')
                : t('Under the weekly limit every week')
              : period === 'week'
                ? tn('Over the daily limit {n} time|Over the daily limit {n} times', overCount)
                : tn('Over the weekly limit {n} time|Over the weekly limit {n} times', overCount)}
          </Text>
        </View>

        <View>
          <View
            style={{
              height: CHART_H + 20,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: c.separator,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: (limit / max) * CHART_H,
                borderTopWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.secondary,
                opacity: 0.7,
              }}
            />
            {bars.map((b, i) => {
              const on = i === sel;
              const color = b.amount === 0 ? c.fill2 : b.amount > limit ? c.warn : on ? c.accent : c.accentSoft;
              return (
                <Pressable
                  key={b.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.label}: ${b.amount ? formatMoney(b.amount, cur) : b.future ? t('not yet') : t('no spending')}${compare ? `, ${t('before: {amount}', { amount: formatMoney(prevBars[i]?.amount ?? 0, cur) })}` : ''}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic('light');
                    setSelected(i);
                  }}
                  style={{ flex: 1, height: CHART_H + 20, justifyContent: 'flex-end', alignItems: 'stretch', gap: 4 }}
                >
                  {on ? (
                    <Text variant="caption" weight="700" tabular style={{ textAlign: 'center', fontSize: 11 }}>
                      {b.amount ? shortAmount(b.amount, cur) : '—'}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
                    {compare ? (
                      <View
                        style={{
                          flex: 1,
                          height: Math.max(2, ((prevBars[i]?.amount ?? 0) / max) * CHART_H),
                          borderTopLeftRadius: 5,
                          borderTopRightRadius: 5,
                          backgroundColor: c.fill2,
                        }}
                      />
                    ) : null}
                    <View
                      style={{
                        flex: 1,
                        height: Math.max(b.amount ? 4 : 2, (b.amount / max) * CHART_H),
                        borderTopLeftRadius: 6,
                        borderTopRightRadius: 6,
                        borderBottomLeftRadius: 2,
                        borderBottomRightRadius: 2,
                        backgroundColor: color,
                      }}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 6 }}>
            {bars.map((b, i) => (
              <Text
                key={b.label}
                variant="caption"
                color={i === sel ? 'label' : 'secondary'}
                weight={i === sel ? '700' : '500'}
                style={{ flex: 1, textAlign: 'center' }}
                numberOfLines={1}
              >
                {b.label}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: c.secondary }} />
            <Text variant="caption" color="secondary" tabular>
              {period === 'week' ? t('Daily limit {amount}', { amount: formatAmount(limit, cur) }) : t('Weekly limit {amount}', { amount: formatAmount(limit, cur) })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.warn }} />
            <Text variant="caption" color="secondary">
              {t('Over limit')}
            </Text>
          </View>
          {compare ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.fill2 }} />
              <Text variant="caption" color="secondary">
                {period === 'week' ? t('Week before') : t('Month before')}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="hand" size={12} color={c.secondary} strokeWidth={2.2} />
            <Text variant="caption" color="secondary">
              {t('Tap a bar')}
            </Text>
          </View>
        </View>
      </Card>

      {summary.isError ? <ErrorRow message={t("Couldn’t load your spending.")} onRetry={() => void summary.refetch()} /> : null}

      {top.length ? (
        <Card style={{ gap: 12 }}>
          <Text variant="title2">{t('Top categories')}</Text>
          {compare ? (
            <Text variant="footnote" color="secondary" style={{ marginTop: -6 }}>
              {t('Change')} {vs}
            </Text>
          ) : null}
          {top.map((cat) => (
            <View key={cat.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name={categoryIcon[cat.category]} bg={c.fill} fg={c.label} size={34} iconSize={18} />
              <Text variant="callout" weight="500" style={{ flex: 1 }}>
                {categoryLabel[cat.category]}
              </Text>
              {compare && prevSummary.data ? (
                cat.changePct !== null ? (
                  <DeltaPill pct={cat.changePct} small />
                ) : (
                  <Text variant="caption" color="secondary">
                    {t('new')}
                  </Text>
                )
              ) : null}
              <Text variant="callout" color="secondary" tabular>
                {formatAmount(cat.amount, cur)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile name="tune" bg={c.aiTint} fg={c.ai} size={40} iconSize={22} />
          <View style={{ gap: 2 }}>
            <Text variant="title2">{t('What if…')}</Text>
            <Text variant="footnote" color="secondary" style={{ fontSize: 14 }}>
              {t('Swap a habit and see what it’s worth')}
            </Text>
          </View>
        </View>
        <WhatIfRow
          icon="transport"
          label={t("Taxi per day")}
          display={formatMoney(inCur(taxi), cur)}
          value={taxi}
          min={5_000}
          max={60_000}
          step={1_000}
          onChange={setTaxi}
          onDone={(v) => setAsked((a) => ({ ...a, taxi: v }))}
        />
        <WhatIfRow
          icon="bus"
          label={t("Bus instead, per day")}
          display={formatMoney(inCur(alt), cur)}
          value={alt}
          min={0}
          max={20_000}
          step={1_000}
          onChange={setAlt}
          onDone={(v) => setAsked((a) => ({ ...a, alt: v }))}
        />
        <WhatIfRow
          icon="calendar"
          label={t("Days per month")}
          display={String(days)}
          value={days}
          min={1}
          max={30}
          step={1}
          onChange={setDays}
          onDone={(v) => setAsked((a) => ({ ...a, days: v }))}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: c.positiveTint, borderRadius: 18, padding: 14, gap: 2 }}>
            <Text variant="caption" color="positiveInk" weight="600">
              {t('Per month')}
            </Text>
            <Text variant="title2" color="positiveInk" tabular style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(monthly, cur)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.fill, borderRadius: 18, padding: 14, gap: 2 }}>
            <Text variant="caption" color="secondary" weight="600">
              {t('Per year')}
            </Text>
            <Text variant="title2" tabular style={{ fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(yearly, cur)}
            </Text>
          </View>
        </View>
        <Button
          title={t("Make this a plan")}
          icon="target"
          size="medium"
          onPress={() =>
            router.navigate({
              pathname: '/assistant',
              params: {
                ask: t('Help me save on taxis: {days} days a month by bus instead of taxi saves about {amount} a month. Make it a plan.', {
                  days,
                  amount: formatMoney(monthly, cur),
                }),
              },
            })
          }
          style={{ borderRadius: 14, height: 48 }}
        />
      </Card>
    </Screen>
  );
}

function NavButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={20} color={c.label} strokeWidth={2.2} />
    </Pressable>
  );
}

/** "+12%" in warning colours (spent more), "−8%" in green (spent less). */
function DeltaPill({ pct, small }: { pct: number; small?: boolean }) {
  const { c } = useTheme();
  const up = pct > 0;
  const color = pct === 0 ? c.secondary : up ? c.warnInk : c.positiveInk;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: small ? 6 : 8,
        height: small ? 22 : 24,
        borderRadius: 12,
        backgroundColor: pct === 0 ? c.fill : up ? c.warnTint : c.positiveTint,
      }}
    >
      {pct !== 0 ? <Icon name={up ? 'arrowUp' : 'arrowDownRight'} size={small ? 11 : 12} color={color} strokeWidth={2.6} /> : null}
      <Text variant="caption" weight="700" tabular style={{ color }}>
        {`${up ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`}
      </Text>
    </View>
  );
}
