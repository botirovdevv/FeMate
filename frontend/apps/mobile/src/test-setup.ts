import { vi } from 'vitest';

// Tests run in English and without device storage: the settings store is replaced by a plain object.
const state = { language: 'en' as 'en' | 'ru' | 'uz', appearance: 'light' };
vi.mock('@/store/settings', () => ({
  useSettings: Object.assign((pick: (s: typeof state) => unknown) => pick(state), { getState: () => state }),
}));
