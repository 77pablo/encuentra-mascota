// NOTA sobre el entorno de test: el preset de React Native (jest-environment-node
// + su setup) define `window` como alias de `global` y `window.navigator` como
// un objeto vacío mutable (para poder simularlo en tests como este), distinto
// del `navigator` global de Node. Por eso el módulo usa siempre
// `window.navigator`/`window.matchMedia`/`window.addEventListener`.
//
// Cada bloque usa `jest.resetModules()` + `jest.doMock('react-native', ...)` +
// `require` dinámico para poder variar `Platform.OS` entre 'web' y una
// plataforma nativa dentro del mismo archivo (jest.mock de nivel de módulo se
// hoistea y queda fijo para todo el archivo).

function limpiarWindowMocks() {
  delete (window as any).addEventListener;
  delete (window as any).matchMedia;
  (window as any).navigator = {};
}

describe('instalarPwa en nativo (Platform.OS !== "web")', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    limpiarWindowMocks();
  });

  it('todo es no-op / false, sin tocar window', () => {
    const mod = require('./instalarPwa');
    expect(() => mod.capturarPromptInstalacion()).not.toThrow();
    expect(mod.puedeInstalar()).toBe(false);
    expect(mod.esIos()).toBe(false);
    expect(mod.estaInstalada()).toBe(false);
    // No se registró ningún listener (window.addEventListener sigue sin definir).
    expect((window as any).addEventListener).toBeUndefined();
  });

  it('pedirInstalacion() devuelve "no-disponible"', async () => {
    const mod = require('./instalarPwa');
    await expect(mod.pedirInstalacion()).resolves.toBe('no-disponible');
  });
});

describe('instalarPwa en web', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
    limpiarWindowMocks();
  });

  describe('capturarPromptInstalacion / puedeInstalar / pedirInstalacion', () => {
    it('capturarPromptInstalacion() es idempotente: llamadas repetidas no agregan listeners duplicados', () => {
      (window as any).addEventListener = jest.fn();
      const mod = require('./instalarPwa');
      mod.capturarPromptInstalacion();
      mod.capturarPromptInstalacion();
      mod.capturarPromptInstalacion();
      // addEventListener se debe haber llamado UNA SOLA VEZ para 'beforeinstallprompt'.
      const llamadas = ((window as any).addEventListener as jest.Mock).mock.calls;
      const llamadasBeforeInstallPrompt = llamadas.filter((call) => call[0] === 'beforeinstallprompt');
      expect(llamadasBeforeInstallPrompt).toHaveLength(1);
      // Limpia para no afectar otros tests.
      mod._resetParaTests?.();
    });

    it('sin que el navegador dispare beforeinstallprompt, no se puede instalar', () => {
      (window as any).addEventListener = jest.fn();
      const mod = require('./instalarPwa');
      mod.capturarPromptInstalacion();
      expect(mod.puedeInstalar()).toBe(false);
    });

    it('al dispararse beforeinstallprompt, guarda el evento (llamando preventDefault) y puedeInstalar() pasa a true', () => {
      let handler: ((e: any) => void) | undefined;
      (window as any).addEventListener = jest.fn((nombre: string, cb: any) => {
        if (nombre === 'beforeinstallprompt') handler = cb;
      });
      const mod = require('./instalarPwa');
      mod.capturarPromptInstalacion();

      const evento = { preventDefault: jest.fn(), prompt: jest.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) };
      handler?.(evento);

      expect(evento.preventDefault).toHaveBeenCalled();
      expect(mod.puedeInstalar()).toBe(true);
    });

    it('pedirInstalacion() dispara prompt(), consume el evento (no se puede instalar de nuevo) y refleja "aceptada"', async () => {
      let handler: ((e: any) => void) | undefined;
      (window as any).addEventListener = jest.fn((nombre: string, cb: any) => {
        if (nombre === 'beforeinstallprompt') handler = cb;
      });
      const mod = require('./instalarPwa');
      mod.capturarPromptInstalacion();
      const evento = {
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      };
      handler?.(evento);

      const resultado = await mod.pedirInstalacion();

      expect(evento.prompt).toHaveBeenCalled();
      expect(resultado).toBe('aceptada');
      expect(mod.puedeInstalar()).toBe(false); // se consumió
    });

    it('pedirInstalacion() refleja "rechazada" cuando el usuario descarta el prompt', async () => {
      let handler: ((e: any) => void) | undefined;
      (window as any).addEventListener = jest.fn((nombre: string, cb: any) => {
        if (nombre === 'beforeinstallprompt') handler = cb;
      });
      const mod = require('./instalarPwa');
      mod.capturarPromptInstalacion();
      const evento = {
        preventDefault: jest.fn(),
        prompt: jest.fn(),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      };
      handler?.(evento);

      await expect(mod.pedirInstalacion()).resolves.toBe('rechazada');
    });

    it('pedirInstalacion() sin prompt guardado devuelve "no-disponible"', async () => {
      (window as any).addEventListener = jest.fn();
      const mod = require('./instalarPwa');
      await expect(mod.pedirInstalacion()).resolves.toBe('no-disponible');
    });
  });

  describe('esIos', () => {
    it('reconoce iPhone/iPad/iPod por userAgent', () => {
      const mod = require('./instalarPwa');
      (window as any).navigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' };
      expect(mod.esIos()).toBe(true);
      (window as any).navigator = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' };
      expect(mod.esIos()).toBe(true);
    });

    it('no confunde Android ni desktop con iOS', () => {
      const mod = require('./instalarPwa');
      (window as any).navigator = { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' };
      expect(mod.esIos()).toBe(false);
      (window as any).navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
      expect(mod.esIos()).toBe(false);
    });
  });

  describe('estaInstalada', () => {
    it('true si matchMedia(display-mode: standalone) da match', () => {
      const mod = require('./instalarPwa');
      (window as any).matchMedia = jest.fn(() => ({ matches: true }));
      expect(mod.estaInstalada()).toBe(true);
    });

    it('true si navigator.standalone (iOS) es true, aunque no haya matchMedia', () => {
      const mod = require('./instalarPwa');
      (window as any).navigator = { standalone: true };
      expect(mod.estaInstalada()).toBe(true);
    });

    it('false si no hay ni matchMedia en standalone ni navigator.standalone', () => {
      const mod = require('./instalarPwa');
      (window as any).matchMedia = jest.fn(() => ({ matches: false }));
      (window as any).navigator = {};
      expect(mod.estaInstalada()).toBe(false);
    });
  });
});
