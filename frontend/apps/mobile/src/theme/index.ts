import { useColorScheme, type TextStyle } from 'react-native';

import { useSettings } from '@/store/settings';
import { dark, light, type Palette } from './colors';

export type { Palette } from './colors';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const radius = { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 } as const;

// Plus Jakarta Sans, one file per weight (loaded in app/_layout.tsx). Text maps fontWeight to these.
export const FONTS = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

/** The font file for a weight: custom fonts can't be bolded by fontWeight on Android, so each weight is its own family. */
export function fontFamily(weight: TextStyle['fontWeight'] | undefined): string {
  const n = weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : Number(weight) || 400;
  if (n >= 800) return FONTS['800'];
  if (n >= 700) return FONTS['700'];
  if (n >= 600) return FONTS['600'];
  if (n >= 500) return FONTS['500'];
  return FONTS['400'];
}

// Titles are semibold and tight, like the reference design; body text stays regular.
export const type = {
  largeTitle: { fontSize: 32, lineHeight: 39, fontWeight: '600', letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.6 },
  title2: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  sectionLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.1 },
} as const;

export function useTheme(): { c: Palette; dark: boolean } {
  const system = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const isDark = appearance === 'system' ? system === 'dark' : appearance === 'dark';
  return { c: isDark ? dark : light, dark: isDark };
}
