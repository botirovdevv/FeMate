import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deviceLang, type Lang } from '@/i18n/device';
import { kv } from '@/lib/storage';

export type Appearance = 'system' | 'light' | 'dark';

interface SettingsState {
  appearance: Appearance;
  /** App language; the server answers in it too (Accept-Language). */
  language: Lang;
  setLanguage: (l: Lang) => void;
  pushEnabled: boolean;
  /** This phone has a server push token, so the server sends the daily report. */
  serverPush: boolean;
  setAppearance: (a: Appearance) => void;
  setPushEnabled: (on: boolean, serverPush?: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      // New installs start on a white background; System, Light and Dark stay in Settings.
      appearance: 'light',
      language: deviceLang(),
      setLanguage: (language) => set({ language }),
      pushEnabled: false,
      serverPush: false,
      setAppearance: (appearance) => set({ appearance }),
      setPushEnabled: (pushEnabled, serverPush = false) => set({ pushEnabled, serverPush: pushEnabled && serverPush }),
    }),
    { name: 'femate.settings', storage: createJSONStorage(() => kv) },
  ),
);
