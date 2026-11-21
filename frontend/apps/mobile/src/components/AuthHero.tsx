import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';
import { LogoMark, Wordmark } from './Logo';
import { Text } from './ui';

/**
 * Sign-in / sign-up hero: a black block whose bottom edge sweeps in a curve (reference design), with the
 * FeMate mark and a line under it. Collapses to a short bar while the keyboard is up.
 */
export function AuthHero({ subtitle, compact, children }: { subtitle: string; compact?: boolean; children?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(390);
  const height = compact ? insets.top + 72 : insets.top + 250;
  // The curve: high on the right, dipping below the block toward the left third, like the reference.
  const curve = compact ? 0 : 70;
  const d = `M0 0 H${width} V${height - curve * 1.6} C${width * 0.78} ${height + curve * 0.2} ${width * 0.42} ${height + curve * 0.25} 0 ${height - curve * 0.35} Z`;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: height + (compact ? 0 : curve * 0.25) }}>
      <Svg width={width} height={height + curve} style={{ position: 'absolute', top: 0, left: 0 }} accessibilityElementsHidden importantForAccessibility="no">
        <Path d={compact ? `M0 0 H${width} V${height} H0 Z` : d} fill={c.hero} />
      </Svg>
      <View style={{ paddingTop: insets.top + (compact ? 14 : 44), paddingHorizontal: 28, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LogoMark size={compact ? 30 : 38} variant="white" animated={!compact} />
          <Wordmark size={compact ? 20 : 26} dark />
        </View>
        {compact ? null : (
          <Text variant="callout" color="rgba(255,255,255,0.62)" style={{ maxWidth: 260 }}>
            {subtitle}
          </Text>
        )}
        {compact ? null : children}
      </View>
    </View>
  );
}

/** Thin rule with a word in the middle ("Or"). */
export function Divider({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
      <Text variant="footnote" color="secondary">
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: c.separator }} />
    </View>
  );
}
