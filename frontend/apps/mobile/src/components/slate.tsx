// "Slate" style building blocks: a black hero block over a white page, round icon actions, black pill buttons.
// The Family screens use them first; the app-wide redesign will reuse them.
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { haptic, PressableScale, Text } from './ui';

export interface SlatePalette {
  heroBg: string;
  heroText: string;
  heroMuted: string;
  heroButton: string;
  heroTrack: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  secondaryBg: string;
  positive: string;
  danger: string;
  dangerTint: string;
  warnTint: string;
  warnInk: string;
}

const LIGHT: SlatePalette = {
  heroBg: '#000000',
  heroText: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.56)',
  heroButton: '#1C1C1E',
  heroTrack: 'rgba(255,255,255,0.18)',
  bg: '#FFFFFF',
  surface: '#F6F5F3',
  border: '#ECEBE9',
  text: '#0A0A0A',
  muted: '#8A8A8E',
  primary: '#000000',
  onPrimary: '#FFFFFF',
  secondaryBg: '#F1F0EE',
  positive: '#1E9E5A',
  danger: '#C62828',
  dangerTint: '#FDECEA',
  warnTint: '#FFF4E5',
  warnInk: '#8A4A00',
};

// Dark mode: the page goes black and the hero lifts to a dark grey so the two still read as separate layers.
const DARK: SlatePalette = {
  heroBg: '#1A1A1C',
  heroText: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.56)',
  heroButton: '#2C2C2F',
  heroTrack: 'rgba(255,255,255,0.16)',
  bg: '#000000',
  surface: '#121214',
  border: '#262628',
  text: '#F4F4F5',
  muted: '#8E8E93',
  primary: '#FFFFFF',
  onPrimary: '#000000',
  secondaryBg: '#1C1C1E',
  positive: '#34C77B',
  danger: '#FF6B61',
  dangerTint: '#3A1614',
  warnTint: '#33240F',
  warnInk: '#F5B65C',
};

export function useSlate(): SlatePalette {
  return useTheme().dark ? DARK : LIGHT;
}

/** Round button on the hero (back, settings, +). */
export function HeroButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const s = useSlate();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s.heroButton, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} size={20} color={s.heroText} strokeWidth={2} />
    </PressableScale>
  );
}

/** Black block at the top of the page with a title, optional back button and right-side buttons. */
export function HeroHeader({ title, back, right, children }: { title: string; back?: boolean; right?: ReactNode; children?: ReactNode }) {
  const s = useSlate();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: s.heroBg,
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 24,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        gap: 20,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        {back ? <HeroButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.6, color: s.heroText }} numberOfLines={1}>
          {title}
        </Text>
        {right ? <View style={{ flexDirection: 'row', gap: 10 }}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** Page: hero on top, white content below, pull-to-refresh. */
export function SlatePage({
  hero,
  children,
  refreshing,
  onRefresh,
}: {
  hero: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const s = useSlate();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: s.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        // The hero is part of the scroll content so pull-to-refresh pulls it down with the page.
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={s.muted} /> : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {hero}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 28 }}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** A 56px round icon with a label under it (Freeze / Details / Limit …). `active` fills it. */
export function CircleAction({
  icon,
  label,
  onPress,
  active,
  disabled,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
}) {
  const s = useSlate();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
      style={{ alignItems: 'center', gap: 8, flex: 1, opacity: disabled ? 0.4 : 1 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: active ? 0 : 1,
          borderColor: s.border,
          backgroundColor: active ? s.primary : s.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={22} color={active ? s.onPrimary : s.text} strokeWidth={1.8} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              paddingHorizontal: 5,
              backgroundColor: s.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 13, lineHeight: 17, color: s.text }} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function LoadingDots({ color }: { color: string }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {[0, 1].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: i ? [0.4, 1, 0.4] : [1, 0.4, 1] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: i ? [0.8, 1.15, 0.8] : [1.15, 0.8, 1.15] }) }],
          }}
        />
      ))}
    </View>
  );
}

/** Full-width pill button. Primary is black (white in dark mode); loading shows two pulsing dots. */
export function PillButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useSlate();
  const bg = variant === 'primary' ? s.primary : variant === 'danger' ? s.dangerTint : s.secondaryBg;
  const fg = variant === 'primary' ? s.onPrimary : variant === 'danger' ? s.danger : s.text;
  return (
    <PressableScale
      onPress={() => {
        if (!loading && !disabled) onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        {
          height: 54,
          borderRadius: 27,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 20,
        },
        style,
      ]}
    >
      {loading ? (
        <LoadingDots color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} strokeWidth={2} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        </>
      )}
    </PressableScale>
  );
}

/** Thick progress bar: black fill (white on the hero). */
export function SlateProgress({ value, onHero, height = 8 }: { value: number; onHero?: boolean; height?: number }) {
  const s = useSlate();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: onHero ? s.heroTrack : s.secondaryBg, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: onHero ? s.heroText : s.primary }} />
    </View>
  );
}

/** "Label → value" rows on a soft card (Confirm order style). The last row can be bold as a total. */
export function StatRows({ rows }: { rows: { label: string; value: string; strong?: boolean }[] }) {
  const s = useSlate();
  return (
    <View style={{ backgroundColor: s.surface, borderRadius: 22, paddingHorizontal: 18 }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 16,
            gap: 12,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: s.border,
          }}
        >
          <Text style={{ color: r.strong ? s.text : s.muted, fontSize: 15, fontWeight: r.strong ? '600' : '400' }}>{r.label}</Text>
          <Text style={{ color: s.text, fontSize: r.strong ? 17 : 15, fontWeight: r.strong ? '700' : '500', fontVariant: ['tabular-nums'], flexShrink: 1, textAlign: 'right' }}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const s = useSlate();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text accessibilityRole="header" style={{ fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2, color: s.text }}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <Text style={{ fontSize: 15, color: s.muted }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** List row: a 44px round icon, title and subtitle, and something on the right. */
export function SlateRow({
  icon,
  avatar,
  title,
  subtitle,
  right,
  last,
  onPress,
}: {
  icon?: IconName;
  avatar?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const s = useSlate();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: s.border }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: s.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: avatar ? s.surface : s.bg,
        }}
      >
        {avatar ? (
          <Text style={{ fontSize: 16, fontWeight: '600', color: s.text }}>{avatar}</Text>
        ) : icon ? (
          <Icon name={icon} size={19} color={s.text} strokeWidth={1.8} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, color: s.text, fontWeight: '500' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, color: s.muted }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} accessibilityRole="button" scaleTo={0.99}>
      {body}
    </PressableScale>
  ) : (
    body
  );
}

/** Code or PIN shown as separate soft tiles. */
export function CodeDigits({ value, length = 6 }: { value: string; length?: number }) {
  const s = useSlate();
  const chars = value.padEnd(length, ' ').slice(0, length).split('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }} accessible accessibilityLabel={value.split('').join(' ')}>
      {chars.map((ch, i) => (
        <View
          key={i}
          style={{ width: 46, height: 60, borderRadius: 14, backgroundColor: s.surface, borderWidth: 1, borderColor: s.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 26, fontWeight: '600', color: s.text }}>{ch.trim()}</Text>
        </View>
      ))}
    </View>
  );
}

/** Rounded pill chip (amount presets). */
export function PillChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const s = useSlate();
  return (
    <PressableScale
      onPress={() => {
        haptic('light');
        onPress();
      }}
      hapticOnPress={false}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexGrow: 1,
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: selected ? s.primary : s.secondaryBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: selected ? s.onPrimary : s.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Inline notice on the white page. */
export function Notice({ tone = 'danger', text }: { tone?: 'danger' | 'warn' | 'info'; text: string }) {
  const s = useSlate();
  const bg = tone === 'danger' ? s.dangerTint : tone === 'warn' ? s.warnTint : s.surface;
  const fg = tone === 'danger' ? s.danger : tone === 'warn' ? s.warnInk : s.text;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: bg, padding: 14, borderRadius: 16 }}
    >
      <Icon name="info" size={18} color={fg} strokeWidth={2} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: fg }}>{text}</Text>
    </View>
  );
}

/** Centered spinner for a first load. */
export function SlateLoading() {
  const s = useSlate();
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={s.muted} />
    </View>
  );
}

/** Sheet body (form sheet screens): padded, white, with a title and a grey note under it. */
export function SheetBody({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const s = useSlate();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: s.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: insets.bottom + 24, gap: 22 }}
    >
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={{ fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4, color: s.text }}>
          {title}
        </Text>
        {note ? <Text style={{ fontSize: 15, lineHeight: 21, color: s.muted }}>{note}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

/** Big centered amount input with the currency mark (Monthly limit sheet style). Value is the raw typed text. */
export function AmountInput({
  value,
  onChange,
  currency,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  currency: string;
  label: string;
  autoFocus?: boolean;
}) {
  const s = useSlate();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={s.muted}
        autoFocus={autoFocus}
        maxLength={14}
        style={{ fontSize: 44, fontWeight: '600', color: s.text, letterSpacing: -1, textAlign: 'center', minWidth: 60, fontVariant: ['tabular-nums'] }}
      />
      <Text style={{ fontSize: 20, fontWeight: '500', color: s.muted }}>{currency}</Text>
    </View>
  );
}

/** Labeled text input on a soft background (Login style). */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoCapitalize = 'sentences',
  maxLength,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  onSubmit?: () => void;
}) {
  const s = useSlate();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: s.text }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={s.muted}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        style={{ height: 54, borderRadius: 16, backgroundColor: s.surface, borderWidth: 1, borderColor: s.border, paddingHorizontal: 16, fontSize: 16, color: s.text }}
      />
    </View>
  );
}
