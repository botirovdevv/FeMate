import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { motionOff } from './motion';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { haptic, Text } from './ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Height of the floating pill, without the bottom inset. Screens leave this much room under their content. */
export const PILL_TAB_BAR_HEIGHT = 64;
const PILL_GAP = 10;
const ITEM = 52;
const GAP = 4;
const PAD = 6;
/** Room a screen needs above the safe-area inset so nothing hides under the pill. */
export const TAB_BAR_SPACE = PILL_TAB_BAR_HEIGHT + PILL_GAP;

/**
 * Floating black pill with round icons; the active tab is a white circle with a black icon (reference design).
 * Labels are kept for screen readers only. Hidden while the keyboard is up.
 */
export function PillTabBar({ state, descriptors, navigation, icons }: TabBarProps & { icons: Record<string, IconName> }) {
  const { dark } = useTheme();
  const insets = useSafeAreaInsets();
  // Out of the way while typing; the screens already lift their inputs above the keyboard.
  const keyboard = useKeyboardHeight();
  const bar = dark ? '#1C1C1F' : '#000000';
  // The active tab is the lime brand circle: a touch of colour on every tab screen.
  const active = '#C6F432';
  const idle = 'rgba(255,255,255,0.55)';
  // The lime circle slides to the tapped tab with a soft spring (reference tab bar).
  const x = useState(() => new Animated.Value(state.index * (ITEM + GAP)))[0];
  useEffect(() => {
    const to = state.index * (ITEM + GAP);
    if (motionOff()) x.setValue(to);
    else Animated.spring(x, { toValue: to, friction: 9, tension: 90, useNativeDriver: true }).start();
  }, [state.index, x]);
  if (keyboard > 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 12) - 4, alignItems: 'center' }}
    >
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: GAP,
          height: PILL_TAB_BAR_HEIGHT,
          paddingHorizontal: PAD,
          borderRadius: PILL_TAB_BAR_HEIGHT / 2,
          backgroundColor: bar,
          borderWidth: dark ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.08)',
          shadowColor: '#000',
          shadowOpacity: dark ? 0 : 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: PAD, top: (PILL_TAB_BAR_HEIGHT - ITEM) / 2, width: ITEM, height: ITEM, borderRadius: ITEM / 2, backgroundColor: active, transform: [{ translateX: x }] }}
        />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options ?? {};
          const label = typeof options.title === 'string' ? options.title : route.name;
          const badge = options.tabBarBadge;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptic('light');
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              hitSlop={4}
              style={{
                width: ITEM,
                height: ITEM,
                borderRadius: ITEM / 2,
                alignItems: 'center',
                justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
              }}
            >
              <Icon name={icons[route.name] ?? 'home'} size={23} color={focused ? '#000000' : idle} strokeWidth={focused ? 2.1 : 1.8} />
              {badge !== undefined ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: '#FF453A',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: focused ? active : bar,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 10, lineHeight: 12 }} weight="700">
                    {String(badge)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
