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
import { useT } from '@/i18n';
import { useCurtain } from '@/components/Curtain';
import { FadeIn, Stagger } from '@/components/motion';

export default function Login() {
  const { run: closeCurtain, curtain } = useCurtain();
  const { t } = useT();
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
      setError(t('Enter your email and password, or tap “Use demo account”.'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.login({ email: email.trim(), password });
      await signIn(res.token);
      haptic('success');
      closeCurtain(() => router.replace('/(tabs)'));
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardScreen style={{ backgroundColor: c.bg }} bounces={false}>
        <AuthHero
          compact={typing}
          subtitle={t('Welcome back! Sign in to continue. Your AI money co-pilot moves money only when you say so.')}
        />

        <FadeIn
          from={80}
          duration={640}
          style={{ flex: 1, paddingHorizontal: 28, paddingTop: typing ? 20 : 12, paddingBottom: insets.bottom + 20, gap: 18 }}
        >
          <Stagger start={160} step={50}>
            <Text variant="title" accessibilityRole="header">
              {t('Sign in')}
            </Text>

            <AuthField
              label={t('Email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('Enter your email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <AuthField
              ref={passwordRef}
              label={t('Password')}
              secure
              value={password}
              onChangeText={setPassword}
              placeholder={t('Enter your password')}
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

            <Button title={t('Sign in')} onPress={submit} loading={busy} />

            <Divider label={t('Or')} />

            <Button
              title={t('Use demo account · aziz@femate.uz')}
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
                {t('Don’t have an account?')}
              </Text>
              <Link href="/register" asChild>
                <Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text variant="callout" weight="700">
                    {t('Sign up')}
                  </Text>
                </Pressable>
              </Link>
            </View>
          </Stagger>
        </FadeIn>
      </KeyboardScreen>
      {curtain}
    </View>
  );
}
