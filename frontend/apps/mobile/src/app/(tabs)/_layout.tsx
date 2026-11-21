import { Redirect, Tabs } from 'expo-router';

import { type IconName } from '@/components/Icon';
import { PillTabBar } from '@/components/PillTabBar';
import { useActions } from '@/lib/queries';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

const ICONS: Record<string, IconName> = {
  index: 'home',
  add: 'plusCircle',
  assistant: 'chat',
  activity: 'shieldCheck',
  reports: 'chart',
};

export default function TabsLayout() {
  const { c } = useTheme();
  const token = useSession((s) => s.token);
  const hydrated = useSession((s) => s.hydrated);
  const pending = useActions('pending');

  if (hydrated && !token) return <Redirect href="/login" />;

  const pendingCount = pending.data?.length ?? 0;
  return (
    <Tabs
      tabBar={(props) => <PillTabBar {...props} icons={ICONS} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="add" options={{ title: 'Add' }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant' }} />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Agent',
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarAccessibilityLabel: pendingCount > 0 ? `Agent, ${pendingCount} action waiting` : 'Agent',
        }}
      />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
    </Tabs>
  );
}
