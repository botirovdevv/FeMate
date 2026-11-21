import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { motionOff } from './motion';

// Fixed positions so the flakes look the same each time (no Math.random during render).
const FLAKES = [
  [0.06, 0, 3.4, 3],
  [0.14, 0.5, 2.8, 2],
  [0.22, 1.2, 3.8, 3],
  [0.31, 0.2, 3.1, 2],
  [0.4, 0.9, 3.6, 4],
  [0.48, 1.6, 2.9, 2],
  [0.57, 0.4, 3.3, 3],
  [0.65, 1.1, 3.9, 2],
  [0.73, 0.1, 3.0, 3],
  [0.81, 1.4, 3.5, 2],
  [0.89, 0.7, 2.7, 3],
  [0.95, 1.9, 3.7, 2],
] as const;

function Flake({ x, delay, duration, size, height }: { x: number; delay: number; duration: number; size: number; height: number }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay * 1000),
        Animated.timing(v, { toValue: 1, duration: duration * 1000, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, duration]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: -6,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity: v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 0.9, 0.9, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 12] }) },
          { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, -2] }) },
        ],
      }}
    />
  );
}

/** Gentle falling snow over a frozen card (reference). Static frost dots when motion is reduced. */
export function Snow({ height }: { height: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {motionOff()
        ? FLAKES.map(([x, , , size], i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${x * 100}%`,
                top: `${((i * 37) % 90) + 5}%`,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: 'rgba(255,255,255,0.8)',
              }}
            />
          ))
        : FLAKES.map(([x, delay, duration, size], i) => (
            <Flake key={i} x={x} delay={delay} duration={duration} size={size} height={height} />
          ))}
    </View>
  );
}
