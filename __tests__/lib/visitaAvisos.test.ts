// Almacenamiento en memoria compartido por ambos caminos (web/móvil), igual que
// __tests__/lib/onboarding.test.ts.
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

import { marcarAvisosLeidos, ultimaVisitaAvisos } from '../../src/lib/visitaAvisos';

// LA "ÚLTIMA VISITA" A LA BANDEJA, GUARDADA LOCAL.
//
// Es lo que evita una migración extra solo para el badge: no hace falta una
// columna `leido_en` en la cola (que además habría que dejar escribible desde
// el cliente, o sea otra RPC más).

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

describe('la última visita a los avisos', () => {
  it('arranca en null: nunca entró', async () => {
    expect(await ultimaVisitaAvisos()).toBeNull();
  });

  it('marcarla la guarda y se puede volver a leer', async () => {
    await marcarAvisosLeidos('2026-08-01T10:00:00Z');
    expect(await ultimaVisitaAvisos()).toBe('2026-08-01T10:00:00Z');
  });

  it('no pisa la marca de otras cosas guardadas local', async () => {
    // La clave tiene que ser propia: si compartiera la de `lastVisit.ts` (la
    // zona de alerta) o la del onboarding, entrar a una pantalla apagaría el
    // badge de la otra.
    mem['zona_alerta_ultima_visita'] = '2026-01-01T00:00:00Z';
    mem['onboarding_visto'] = '1';
    await marcarAvisosLeidos('2026-08-01T10:00:00Z');
    expect(mem['zona_alerta_ultima_visita']).toBe('2026-01-01T00:00:00Z');
    expect(mem['onboarding_visto']).toBe('1');
  });

  it('sin almacenamiento no rompe: degrada a null y a no-op', async () => {
    // En web con el almacenamiento bloqueado (cookies de terceros apagadas,
    // ventana privada), `localStorage` tira al tocarlo; en móvil, SecureStore
    // puede fallar si el llavero no está disponible. Se rompen los DOS caminos
    // a la vez para no depender de qué `Platform.OS` reporte el entorno de test.
    // Un badge no puede tumbar el Perfil.
    const originalLs = (global as any).localStorage;
    const secure = require('expo-secure-store');
    const revienta = () => {
      throw new Error('bloqueado');
    };
    (global as any).localStorage = { getItem: revienta, setItem: revienta };
    // `mockImplementationOnce` sobre el propio jest.fn: reasignar la propiedad
    // del módulo no alcanza (el binding ya está resuelto en el import).
    secure.setItemAsync.mockImplementationOnce(revienta);
    secure.getItemAsync.mockImplementationOnce(revienta);
    try {
      await expect(marcarAvisosLeidos('2026-08-01T10:00:00Z')).resolves.toBeUndefined();
      await expect(ultimaVisitaAvisos()).resolves.toBeNull();
    } finally {
      (global as any).localStorage = originalLs;
    }
  });
});
