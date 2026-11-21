import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField } from '@/components/AuthField';
import { AuthHero } from '@/components/AuthHero';
import { KeyboardScreen, useKeyboardHeight } from '@/components/KeyboardScreen';
import { Button, haptic, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isAcceptablePassword, passwordStrength, type PasswordLevel } from '@/lib/password';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';

export default function Register() {
  const { t } = useT();
  const { c } = useTheme();
  const typing = useKeyboardHeight() > 0;
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  const strength = passwordStrength(password);
  const passwordOk = isAcceptablePassword(password);

  const submit = async () => {
    if (busy) return; // the keyboard's Go key and the button can both fire
    setError(null);
    if (!name.trim()) {
      haptic('warning');
      setError(t('Enter your name.'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      haptic('warning');
      setError(t('Enter a valid email, like you@example.com.'));
      return;
    }
    if (!passwordOk) {
      haptic('warning');
      setError(`${t('Choose a stronger password.')} ${strength.hint || t('Use at least 8 characters.')}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.register({ name: name.trim(), email: email.trim(), password });
      await signIn(res.token);
      haptic('success');
      router.replace('/appearance');
    } catch (e) {
      haptic('warning');
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen style={{ backgroundColor: c.bg }} bounces={false}>
      <AuthHero compact={typing} subtitle={t("Two minutes to set up. You stay in control of every transfer.")} />
      <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: typing ? 20 : 12, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <Text variant="title" accessibilityRole="header">
          {t('Create account')}
        </Text>
        <AuthField
          label={t("Name")}
          value={name}
          onChangeText={setName}
          placeholder={t("Your name")}
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <AuthField
          ref={emailRef}
          label={t("Email")}
          value={email}
          onChangeText={setEmail}
          placeholder={t("Enter your email")}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
        />
        <AuthField
          ref={passRef}
          label={t("Password")}
          secure
          value={password}
          onChangeText={setPassword}
          placeholder={t("8+ characters")}
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {strength.level !== 'empty' ? <StrengthMeter level={strength.level} hint={strength.hint} /> : null}
        {error ? (
          <Text variant="footnote" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button title={t("Continue")} onPress={submit} loading={busy} disabled={!passwordOk} />
        <View style={{ flex: 1, minHeight: 12 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Text variant="callout" color="secondary">
            {t('Already have an account?')}
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="callout" weight="700">
              {t('Sign in')}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardScreen>
  );
}

// t('Weak') t('Medium') t('Strong')
const LEVELS = { weak: { bars: 1, label: 'Weak' }, medium: { bars: 2, label: 'Medium' }, strong: { bars: 3, label: 'Strong' } } as const;

function StrengthMeter({ level, hint }: { level: Exclude<PasswordLevel, 'empty'>; hint: string }) {
  const { c } = useTheme();
  const color = { weak: c.danger, medium: c.warn, strong: c.positive }[level];
  const { t } = useT();
  const { bars } = LEVELS[level];
  const label = t(LEVELS[level].label);
  return (
    <View style={{ gap: 6 }} accessibilityLabel={t('Password strength: {label}. {hint}', { label, hint })} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < bars ? color : c.fill }} />
        ))}
      </View>
      <Text variant="footnote" color="secondary">
        <Text variant="footnote" weight="600" style={{ color }}>
          {label}
        </Text>
        {`  ${hint}`}
      </Text>
    </View>
  );
}
