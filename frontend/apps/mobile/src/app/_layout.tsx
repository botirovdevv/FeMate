import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useSlate } from '@/components/slate';
import { Button, Text } from '@/components/ui';

import { queryClient } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

// Shown instead of a white screen when a screen throws while rendering.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <Icon name="info" size={40} color={c.secondary} />
      <Text variant="title2" style={{ textAlign: 'center' }}>
        Something went wrong on this screen
      </Text>
      <Text variant="footnote" color="secondary" style={{ textAlign: 'center' }} selectable>
        {error.message}
      </Text>
      <Button title="Try again" icon="refresh" size="medium" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const hydrate = useSession((s) => s.hydrate);
  const { c, dark } = useTheme();
  const slate = useSlate();
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // When the session ends anywhere (expired token on any screen, sign-out), go to sign-in.
  const token = useSession((s) => s.token);
  const prevToken = useRef(token);
  useEffect(() => {
    if (prevToken.current && !token) router.replace('/login');
    prevToken.current = token;
  }, [token]);

  // Bundled fonts load in a moment; until then keep the (black) background instead of flashing the system font.
  // A load failure falls back to the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: '#000000' }} />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="appearance" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="connect-bank" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="transactions" />
          <Stack.Screen name="card" />
          <Stack.Screen name="balances" />
          <Stack.Screen
            name="money"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.92],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: c.sheet },
            }}
          />
          <Stack.Screen
            name="action/[id]"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.86],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              contentStyle: { backgroundColor: c.sheet },
            }}
          />
          <Stack.Screen name="family/index" options={{ contentStyle: { backgroundColor: slate.bg } }} />
          {(['family/create', 'family/join', 'family/budget', 'family/invite', 'family/request'] as const).map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: name === 'family/invite' || name === 'family/join' ? [0.7] : [0.92],
                sheetGrabberVisible: true,
                sheetCornerRadius: 28,
                contentStyle: { backgroundColor: slate.bg },
              }}
            />
          ))}
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
