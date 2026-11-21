import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import { useEffect } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { fontFamily, radius, space, type, useTheme, type Palette } from '@/theme';
import { Icon, type IconName } from './Icon';
import { useT } from '@/i18n';

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === 'warning') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

type Variant = keyof typeof type;

export function Text({
  variant = 'body',
  color,
  weight,
  tabular,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: keyof Palette | (string & {}); weight?: TextStyle['fontWeight']; tabular?: boolean }) {
  const { c } = useTheme();
  const resolved = color ? ((c as unknown as Record<string, string>)[color] ?? color) : c.label;
  const flat = StyleSheet.flatten([type[variant] as TextStyle, { color: resolved }, weight ? { fontWeight: weight } : null, style]);
  // An explicit fontFamily (e.g. monospace for log events) wins over the app font.
  return (
    <RNText {...rest} style={[flat, flat.fontFamily ? null : font(flat.fontWeight), tabular ? { fontVariant: ['tabular-nums'] } : null]} />
  );
}

/**
 * The Manrope file for a weight. fontWeight is reset, since a custom family plus a weight makes iOS
 * look for a variant that doesn't exist and Android fake-bold the glyphs.
 */
export function font(weight?: TextStyle['fontWeight']): TextStyle {
  return { fontFamily: fontFamily(weight), fontWeight: 'normal' };
}

/** Two pulsing dots, the loading state of pill buttons. */
export function LoadingDots({ color }: { color: string }) {
  const { t } = useT();
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }} accessibilityLabel={t('Loading')}>
      {[0, 1].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 9,
            height: 9,
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

// Feedback on press-in (scale + haptic), the way native controls respond under the finger.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  hapticOnPress = true,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean; children: ReactNode }) {
  const scale = useState(() => new Animated.Value(1))[0];
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (hapticOnPress) haptic('light');
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Keys of a button style that belong to its coloured body; the rest (flex, margins, alignSelf) place it.
const SURFACE_KEYS = new Set(['height', 'minHeight', 'borderRadius', 'backgroundColor', 'paddingHorizontal', 'borderWidth', 'borderColor']);

export function splitButtonStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = StyleSheet.flatten(style) ?? {};
  const surface: Record<string, unknown> = {};
  const outer: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (SURFACE_KEYS.has(k) ? surface : outer)[k] = v;
  return [surface as ViewStyle, outer as ViewStyle];
}

/**
 * The coloured body of a pill button. While loading it narrows into a small pill around the dots, the way the
 * reference's Login and Order buttons do; it widens back when done.
 */
export function MorphSurface({
  loading,
  height,
  style,
  children,
}: {
  loading?: boolean;
  height: number;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [w, setW] = useState(0);
  const p = useState(() => new Animated.Value(loading ? 1 : 0))[0];
  useEffect(() => {
    Animated.timing(p, {
      toValue: loading ? 1 : 0,
      duration: 320,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: false,
    }).start();
  }, [loading, p]);
  const inset = Math.max(0, (w - height * 1.9) / 2);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ alignSelf: 'stretch' }}>
      <Animated.View style={[style, { marginHorizontal: p.interpolate({ inputRange: [0, 1], outputRange: [0, inset] }) }]}>
        {children}
      </Animated.View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  size = 'large',
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'tinted' | 'danger' | 'strong' | 'plain';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'large' | 'medium' | 'small';
}) {
  const { c } = useTheme();
  const colors = {
    primary: [c.accent, c.onAccent],
    secondary: [c.fill, c.label],
    tinted: [c.accentTint, c.accentInk],
    danger: [c.danger, '#FFFFFF'],
    strong: [c.strong, c.onStrong],
    plain: ['transparent', c.label],
  }[variant];
  const height = { large: 54, medium: 44, small: 36 }[size];
  const fontSize = { large: 16, medium: 15, small: 14 }[size];
  const [surface, outer] = splitButtonStyle(style);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[{ opacity: disabled ? 0.4 : 1 }, outer]}
    >
      <MorphSurface
        loading={loading}
        height={Number(surface.height ?? height)}
        style={[
          {
            height,
            paddingHorizontal: { large: 20, medium: 16, small: 12 }[size],
            borderRadius: height / 2,
            backgroundColor: colors[0],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            overflow: 'hidden',
          },
          surface,
        ]}
      >
        {loading ? (
          <LoadingDots color={colors[1]!} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={fontSize + 2} color={colors[1]!} strokeWidth={2} /> : null}
            {/* One line always: a narrow button shrinks its label a little instead of wrapping it. */}
            <RNText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[{ color: colors[1], fontSize, flexShrink: 1 }, font('600')]}
            >
              {title}
            </RNText>
            {iconRight ? <Icon name={iconRight} size={fontSize + 1} color={colors[1]!} strokeWidth={2} /> : null}
          </>
        )}
      </MorphSurface>
    </PressableScale>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.xl, padding: padded ? space.xl : 0 }, style]}>{children}</View>;
}

export function IconTile({
  name,
  bg,
  fg,
  size = 36,
  iconSize,
}: {
  name: IconName;
  bg: string;
  fg: string;
  size?: number;
  iconSize?: number;
  rounded?: number;
}) {
  return (
    // Always round, like the reference design; `rounded` is kept in the props for older call sites.
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={name} size={iconSize ?? Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="headline" accessibilityRole="header" style={{ paddingHorizontal: space.xs, marginBottom: space.md }}>
      {children}
    </Text>
  );
}

export function Chip({ label, icon, selected, onPress }: { label: string; icon?: IconName; selected?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  const bg = selected ? c.accent : c.fill;
  const fg = selected ? c.onAccent : c.label;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={fg} strokeWidth={1.9} /> : null}
      <RNText style={[{ color: fg, fontSize: 14 }, font('600')]}>{label}</RNText>
    </PressableScale>
  );
}

export function ProgressBar({ value, color, track, height = 8 }: { value: number; color: string; track: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height, borderRadius: height / 2, width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }} />
    </View>
  );
}

export function ListRow({
  icon,
  title,
  value,
  valueColor,
  onPress,
  last,
  destructive,
  right,
}: {
  icon?: IconName;
  tile?: string;
  title: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
  right?: ReactNode;
}) {
  const { c } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, gap: 12, minHeight: 56 }}>
      {/* Plain line icon (Profile style); `tile` colors from the old design are ignored. */}
      {icon ? (
        <View style={{ width: 28, alignItems: 'center' }}>
          <Icon name={icon} size={21} color={destructive ? c.danger : c.label} strokeWidth={1.8} />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingRight: 12,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: c.separator,
        }}
      >
        <Text variant="body" color={destructive ? c.danger : c.label} weight={destructive ? '500' : undefined}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {value ? (
            <Text variant="body" color={valueColor ?? c.secondary} tabular>
              {value}
            </Text>
          ) : null}
          {right}
          {onPress && !destructive ? <Icon name="chevronRight" size={16} color={c.chevron} strokeWidth={2} /> : null}
        </View>
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, borderRadius: 24, backgroundColor: c.fill }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic('light');
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 19,
              backgroundColor: on ? c.accent : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {o.icon ? <Icon name={o.icon} size={15} color={on ? c.onAccent : c.secondary} strokeWidth={2} /> : null}
            <RNText style={[{ color: on ? c.onAccent : c.secondary, fontSize: 14 }, font('600')]}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// Inline load failure with a retry, so a failed request never leaves a spinner turning forever.
export function ErrorRow({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const { c } = useTheme();
  const { t } = useT();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: c.dangerTint }}
    >
      <Icon name="info" size={18} color={c.dangerInk} strokeWidth={2.2} />
      <Text variant="footnote" color={c.dangerInk} style={{ flex: 1 }}>
        {message ?? t('Couldn’t load this.')}
      </Text>
      <Button
        title={t('Try again')}
        icon="refresh"
        size="small"
        variant="secondary"
        onPress={onRetry}
        style={{ backgroundColor: c.card }}
      />
    </View>
  );
}

export function Banner({
  tone,
  icon,
  title,
  subtitle,
  onPress,
  action,
}: {
  tone: 'warn' | 'success' | 'danger';
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const { c } = useTheme();
  const t = {
    warn: { bg: c.warnTint, ink: c.warnInk, dot: c.warn, onDot: c.onWarn },
    success: { bg: c.positiveTint, ink: c.positiveInk, dot: c.positive, onDot: '#FFFFFF' },
    danger: { bg: c.dangerTint, ink: c.dangerInk, dot: c.danger, onDot: '#FFFFFF' },
  }[tone];
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        paddingHorizontal: 16,
        borderRadius: radius.xl,
        backgroundColor: t.bg,
      }}
    >
      <IconTile name={icon} bg={t.dot} fg={t.onDot} size={36} iconSize={19} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" weight="600">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color={t.ink}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ?? (onPress ? <Icon name="chevronRight" size={16} color={t.ink} strokeWidth={2.2} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button">
      {body}
    </PressableScale>
  );
}
