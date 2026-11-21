// Motion, after the reference videos: content rises in with a short stagger, numbers count up, bars grow.
// Native-driver Animated only (runs in Expo Go). Everything is instant when the phone asks for reduced motion.
import { useFocusEffect } from 'expo-router';
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from './ui';

/** The easing the reference uses: quick out, long gentle settle. */
export const EASE_OUT = Easing.bezier(0.32, 0.72, 0, 1);

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion = v));
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduceMotion = v));
export const motionOff = () => reduceMotion;

/** Bumps when a screen should replay its entrance (a tab coming back into focus). */
const PlayContext = createContext(0);

/**
 * Wrap a screen's content. Tab screens replay their entrance each time they come into focus, like switching
 * tabs in the reference; other screens play it once.
 */
export function MotionScope({ replayOnFocus, children }: { replayOnFocus?: boolean; children: ReactNode }) {
  const [play, setPlay] = useState(0);
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!replayOnFocus) return;
      if (first.current) {
        first.current = false;
        return;
      }
      setPlay((p) => p + 1);
    }, [replayOnFocus]),
  );
  return <PlayContext.Provider value={play}>{children}</PlayContext.Provider>;
}

/** Fades in and rises a few points; `delay` staggers siblings (index × 60 ms reads well). */
export function FadeIn({
  children,
  delay = 0,
  from = 14,
  duration = 520,
  style,
}: {
  children: ReactNode;
  delay?: number;
  from?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const play = useContext(PlayContext);
  const v = useState(() => new Animated.Value(motionOff() ? 1 : 0))[0];
  useEffect(() => {
    if (motionOff()) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [play, v, delay, duration]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** Pops in with a soft spring (success marks, avatars). */
export function PopIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const play = useContext(PlayContext);
  const v = useState(() => new Animated.Value(motionOff() ? 1 : 0))[0];
  useEffect(() => {
    if (motionOff()) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [play, v, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A number that counts up to `value` (from about 60 % of it) when it first shows or changes, like the balance
 * in the reference. `format` turns the running number into text, e.g. formatMoney.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  style,
  ...textProps
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
} & Omit<React.ComponentProps<typeof Text>, 'children' | 'style'>) {
  const play = useContext(PlayContext);
  const [shown, setShown] = useState(value);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (motionOff()) {
      last.current = value;
      return;
    }
    const from = last.current === null || last.current === value ? Math.round(value * 0.6) : last.current;
    last.current = value;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: p }) => setShown(Math.round(from + (value - from) * p)));
    const a = Animated.timing(v, { toValue: 1, duration, easing: EASE_OUT, useNativeDriver: false });
    a.start(() => setShown(value));
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [value, play, duration]);
  return (
    <Text {...textProps} style={style}>
      {format(motionOff() ? value : shown)}
    </Text>
  );
}

/** A progress bar fill that grows from the left. */
export function GrowBar({
  value,
  color,
  track,
  height = 8,
  delay = 120,
}: {
  value: number;
  color: string;
  track: string;
  height?: number;
  delay?: number;
}) {
  const play = useContext(PlayContext);
  const pct = Math.max(0, Math.min(1, value));
  const v = useState(() => new Animated.Value(motionOff() ? pct : 0))[0];
  const lastPlay = useRef(play);
  useEffect(() => {
    if (motionOff()) {
      v.setValue(pct);
      return;
    }
    // A replay (tab focus) starts from empty; a new value grows from where it is.
    if (lastPlay.current !== play) {
      lastPlay.current = play;
      v.setValue(0);
    }
    const a = Animated.timing(v, { toValue: pct, duration: 900, delay, easing: EASE_OUT, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [pct, play, v, delay]);
  return (
    <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          width: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
          transformOrigin: 'left',
          transform: [{ scaleX: v }],
        }}
      />
    </Animated.View>
  );
}

/** Children with fragments opened up, so each real section animates (and keeps its gap) on its own. */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((c) =>
    isValidElement<{ children?: ReactNode }>(c) && c.type === Fragment ? flatten(c.props.children) : [c],
  );
}

/** Each child fades and rises in a little after the one before (the reference's list entrance). */
export function Stagger({
  children,
  step = 60,
  start = 0,
  max = 10,
}: {
  children: ReactNode;
  step?: number;
  start?: number;
  max?: number;
}) {
  return (
    <>
      {flatten(children).map((c, i) => {
        // A flexible spacer (style flex) keeps stretching inside its animated wrapper.
        const flex = isValidElement<{ style?: StyleProp<ViewStyle> }>(c) ? StyleSheet.flatten(c.props.style)?.flex : undefined;
        return (
          <FadeIn key={isValidElement(c) && c.key != null ? c.key : i} delay={start + Math.min(i, max) * step} style={flex ? { flex } : undefined}>
            {c}
          </FadeIn>
        );
      })}
    </>
  );
}
