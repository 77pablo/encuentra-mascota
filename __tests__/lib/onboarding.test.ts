// Almacenamiento en memoria compartido por ambos caminos (web/móvil) para que
// el round-trip funcione sin importar Platform.OS en el entorno de test.
const mem: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mem[k] = v;
  }),
}));

import { getOnboardingVisto, setOnboardingVisto } from '../../src/lib/onboarding';

describe('onboarding visto', () => {
  it('arranca en false y pasa a true tras marcarlo', async () => {
    expect(await getOnboardingVisto()).toBe(false);
    await setOnboardingVisto();
    expect(await getOnboardingVisto()).toBe(true);
  });
});
