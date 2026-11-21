// Color tokens (light + dark), "Slate" style: monochrome, green for positive states only (money in, on track,
// approved) and the lime brand accent used a little on every screen. Screens read these through useTheme().

export interface Palette {
  bg: string;
  card: string;
  sheet: string;
  fill: string;
  fill2: string;
  label: string;
  secondary: string;
  body: string;
  separator: string;
  chevron: string;
  accent: string;
  onAccent: string;
  accentTint: string;
  accentInk: string;
  accentSoft: string;
  warn: string;
  onWarn: string;
  warnTint: string;
  warnInk: string;
  danger: string;
  dangerTint: string;
  dangerInk: string;
  hero: string;
  strong: string;
  onStrong: string;
  tabActive: string;
  tabInactive: string;
  material: string;
  materialEdge: string;
  categoryShades: readonly [string, string, string, string];
  /** Money in, on track, approved. */
  positive: string;
  positiveTint: string;
  positiveInk: string;
  /**
   * The brand accent, lime #C6F432: a little of it on every screen (active tab, hero progress, the AI, highlights).
   * It's light, so it's a fill with black on it, or a highlight on black; text on white uses `brandInk`.
   * It never means a money state (that's green, amber, red).
   */
  brand: string;
  onBrand: string;
  brandTint: string;
  brandInk: string;
}

export const light: Palette = {
  bg: '#FFFFFF',
  card: '#F6F5F3',
  sheet: '#FFFFFF',
  fill: '#F1F0EE',
  fill2: '#E6E5E2',
  label: '#0A0A0A',
  secondary: '#6E6E73',
  body: '#2C2C2E',
  separator: '#ECEBE9',
  chevron: '#B5B4B1',
  accent: '#000000',
  onAccent: '#FFFFFF',
  accentTint: '#F1F0EE',
  accentInk: '#0A0A0A',
  accentSoft: '#8A8A8E',
  warn: '#B25E00',
  onWarn: '#FFFFFF',
  warnTint: '#FFF4E5',
  warnInk: '#8A4A00',
  danger: '#C62828',
  dangerTint: '#FDECEA',
  dangerInk: '#A11F1F',
  hero: '#000000',
  strong: '#000000',
  onStrong: '#FFFFFF',
  tabActive: '#000000',
  tabInactive: '#8A8A8E',
  material: 'rgba(255,255,255,0.86)',
  materialEdge: 'rgba(0,0,0,0.08)',
  categoryShades: ['#0A0A0A', '#4A4A4C', '#8E8E93', '#C7C7CC'],
  positive: '#1E9E5A',
  positiveTint: '#E6F5EC',
  positiveInk: '#12673A',
  brand: '#C6F432',
  onBrand: '#000000',
  brandTint: '#F2FCCF',
  brandInk: '#4A5E00',
};

// Dark: the page is black, surfaces lift to dark greys, and black-on-white controls flip to white-on-black.
export const dark: Palette = {
  bg: '#000000',
  card: '#141416',
  sheet: '#141416',
  fill: '#1E1E20',
  fill2: '#2C2C2F',
  label: '#F4F4F5',
  secondary: '#9A9AA0',
  body: '#D4D4D8',
  separator: '#262628',
  chevron: '#5A5A5E',
  accent: '#FFFFFF',
  onAccent: '#000000',
  accentTint: '#1E1E20',
  accentInk: '#F4F4F5',
  accentSoft: '#6E6E73',
  warn: '#E08A1E',
  onWarn: '#1C1000',
  warnTint: '#33240F',
  warnInk: '#F5B65C',
  danger: '#FF6B61',
  dangerTint: '#3A1614',
  dangerInk: '#FF8A80',
  hero: '#1A1A1C',
  strong: '#FFFFFF',
  onStrong: '#000000',
  tabActive: '#FFFFFF',
  tabInactive: '#8E8E93',
  material: 'rgba(20,20,22,0.86)',
  materialEdge: 'rgba(255,255,255,0.10)',
  categoryShades: ['#F4F4F5', '#B5B5BA', '#7A7A80', '#4A4A4E'],
  positive: '#34C77B',
  positiveTint: '#12301F',
  positiveInk: '#8BE3B5',
  brand: '#C6F432',
  onBrand: '#000000',
  brandTint: '#262F0B',
  brandInk: '#C6F432',
};
