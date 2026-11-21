import { useState } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';
import { EASE_OUT, motionOff } from './motion';

/**
 * After signing in, a black panel sweeps down over the screen before the app opens (reference login → home).
 * `run(then)` plays it and calls `then` at the end; with reduced motion `then` runs at once.
 */
export function useCurtain() {
  const { c } = useTheme();
  const v = useState(() => new Animated.Value(0))[0];
  const [shown, setShown] = useState(false);
  const run = (then: () => void) => {
    if (motionOff()) return then();
    setShown(true);
    Animated.timing(v, { toValue: 1, duration: 420, easing: EASE_OUT, useNativeDriver: true }).start(() => then());
  };
  const h = Dimensions.get('window').height;
  const curtain = shown ? (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: c.hero, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] }) }] }]}
    />
  ) : null;
  return { run, curtain };
}
