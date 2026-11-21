import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField } from '@/components/AuthField';
import { AuthHero, Divider } from '@/components/AuthHero';
import { KeyboardScreen, useKeyboardHeight } from '@/components/KeyboardScreen';
import { Button, haptic, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

export default function Login() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const typing = useKeyboardHeight() > 0;

  const submit = async () => {
    if (busy) return; // the keyboard's Go key and the button can both fire
    setError(null);
    if (!email.trim() || !password) {
      haptic('warning');
      setError('Enter your email and password, or tap “Use demo account”.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.login({ email: email.trim(), password });
      await signIn(res.token);
      haptic('success');
      router.replace('/(tabs)');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen style={{ backgroundColor: c.bg }} bounces={false}>
      <AuthHero compact={typing} subtitle="Welcome back! Sign in to continue. Your AI money co-pilot moves money only when you say so." />

      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: typing ? 20 : 12, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <Text variant="title" accessibilityRole="header">
          Sign in
        </Text>

        <AuthField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <AuthField
          ref={passwordRef}
          label="Password"
          secure
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {error ? (
          <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button title="Sign in" onPress={submit} loading={busy} />

        <Divider label="Or" />

        <Button
          title="Use demo account · aziz@femate.uz"
          icon="user"
          variant="secondary"
          onPress={() => {
            haptic('light');
            setEmail('aziz@femate.uz');
            setPassword('demo1234');
            setError(null);
          }}
        />

        <View style={{ flex: 1, minHeight: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Text variant="callout" color="secondary">
            Don’t have an account?
          </Text>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text variant="callout" weight="700">
                Sign up
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardScreen>
  );
}
