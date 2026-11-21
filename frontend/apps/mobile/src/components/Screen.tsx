import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { space, useTheme } from '@/theme';
import { TAB_BAR_SPACE } from './PillTabBar';
import { MotionScope, Stagger } from './motion';
import { HeroHeader } from './slate';
import { Text } from './ui';

// Room under tab screens for the floating pill tab bar.
export const TAB_BAR_HEIGHT = TAB_BAR_SPACE;

/**
 * Scrollable page. With a `title` it opens with the black Slate hero (title, subtitle, right-side buttons and
 * optional `hero` content such as a big number); the white page follows. `tabs` leaves room for the tab bar.
 */
export function Screen({
  title,
  subtitle,
  right,
  hero,
  back,
  children,
  tabs,
  bottomInset = 0,
  refreshing,
  onRefresh,
  header,
  scrollProps,
}: {
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  /** Extra content inside the black hero, under the title. */
  hero?: ReactNode;
  /** Round back button in the hero. */
  back?: boolean;
  children: ReactNode;
  tabs?: boolean;
  bottomInset?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Content above everything, for screens without a title. */
  header?: ReactNode;
  scrollProps?: ScrollViewProps;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  return (
    <MotionScope replayOnFocus={tabs}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          {...scrollProps}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.secondary} /> : undefined
          }
          contentContainerStyle={{
            paddingTop: title ? 0 : insets.top + space.md,
            // While typing, the keyboard covers the tab bar, so room for the keyboard replaces it.
            paddingBottom: (kb > 0 ? kb : tabs ? insets.bottom + TAB_BAR_HEIGHT : insets.bottom) + space.xxl + bottomInset,
          }}
        >
          {title ? (
            <HeroHeader title={title} back={back} right={right}>
              {subtitle || hero ? (
                <View style={{ gap: 16 }}>
                  {typeof subtitle === 'string' ? (
                    <Text variant="callout" color="rgba(255,255,255,0.6)" style={{ marginTop: -8 }}>
                      {subtitle}
                    </Text>
                  ) : (
                    subtitle
                  )}
                  {hero}
                </View>
              ) : null}
            </HeroHeader>
          ) : null}
          <View style={{ paddingHorizontal: space.xl, paddingTop: title ? space.xxl : 0, gap: space.xl }}>
            {header}
            <Stagger start={120}>{children}</Stagger>
          </View>
        </ScrollView>
      </View>
    </MotionScope>
  );
}
