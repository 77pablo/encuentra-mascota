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

import { getTemaPref, setTemaPref } from '../../src/lib/temaPref';

describe('temaPref', () => {
  it('por defecto es "auto"', async () => {
    expect(await getTemaPref()).toBe('auto');
  });

  it('guarda y devuelve el modo elegido', async () => {
    await setTemaPref('oscuro');
    expect(await getTemaPref()).toBe('oscuro');
    await setTemaPref('claro');
    expect(await getTemaPref()).toBe('claro');
  });
});
