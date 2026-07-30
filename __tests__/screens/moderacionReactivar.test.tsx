import React from 'react';
import { act, create } from 'react-test-renderer';
import ModeracionScreen from '../../src/screens/ModeracionScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// DESHACER UNA SUSPENSIÓN — la mitad que faltaba del panel.
//
// `moderar_suspender` marcaba la cuenta y nada la desmarcaba, así que un toque
// equivocado solo se arreglaba desde el SQL Editor. Y como al suspender la
// denuncia queda resuelta y sale de la bandeja, la cuenta suspendida no
// aparecía en ninguna pantalla: no había forma de saber a quién se había
// suspendido.
//
// El caso que más importa acá es el TERCERO: si no se pueden leer las cuentas
// suspendidas, la pantalla NO puede mostrar "ninguna". Es la forma exacta del
// Critical que ya apareció dos veces en este proyecto (el perfil degradado que
// guardaba '' encima del teléfono real, y AlertZoneScreen mostrando los valores
// por defecto como si fueran la config guardada): un fallo de lectura
// disfrazado de dato vacío, y encima con un botón al lado para actuar sobre él.

// Montar la pantalla real es lento y bajo carga se pasa del timeout por defecto
// (5 s). Los otros tests de pantalla del repo hacen lo mismo con `}, 30000)` en
// cada `it`; acá se fija una vez para todo el archivo.
jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// useFocusEffect no existe fuera de un navigator: acá alcanza con correr el
// callback una vez, que es lo que hace al entrar a la pantalla.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: () => Promise.resolve(true),
}));

const mockBandeja = jest.fn();
const mockSuspendidos = jest.fn();
const mockReactivar = jest.fn();
jest.mock('../../src/services/moderacionAdmin', () => ({
  bandeja: () => mockBandeja(),
  suspendidos: () => mockSuspendidos(),
  reactivar: (...args: any[]) => mockReactivar(...args),
  retirar: jest.fn(() => Promise.resolve({ fotoPendiente: false })),
  descartar: jest.fn(() => Promise.resolve()),
  suspender: jest.fn(() => Promise.resolve()),
}));

const SUSPENDIDA = { id: 'u-bob', nombre: 'Bob', suspendidoEn: '2026-07-29T10:00:00Z' };

// Montar una pantalla de verdad (con todo el stack de react-native detrás) es
// LENTO: en aislamiento este archivo tarda ~5 s y dentro de la suite completa
// llegó a 24 s, así que el primer test se pasaba del timeout de 5 s de jest y
// fallaba de forma intermitente. De ahí el `jest.setTimeout` de arriba, igual que
// en chatDenunciaMensaje.test.tsx.
//
// Además se espera a que el panel esté EN PANTALLA en vez de suponer cuántos
// ticks hace falta: mientras `loading` es true la pantalla entera es <Loading />,
// y la carga son dos promesas más el ThemeProvider.
async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ModeracionScreen />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && !textos(arbol).includes('Cuentas suspendidas'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(textos(arbol)).toContain('Cuentas suspendidas');
  return arbol;
}

// Todo el texto renderizado, junto.
function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function botones(arbol: any, title: string): any[] {
  return arbol.root.findAll(
    (n: any) => typeof n.type !== 'string' && n.props?.title === title,
  );
}

beforeEach(() => {
  mockNotify.mockReset();
  mockBandeja.mockReset().mockResolvedValue([]);
  mockSuspendidos.mockReset().mockResolvedValue([]);
  mockReactivar.mockReset().mockResolvedValue(undefined);
});

// Reactivar dispara una recarga (`conAccion` llama a `cargar`), y esas promesas
// se resuelven DESPUÉS de que termina el test: jest las agarra como
// "Cannot log after tests are done" y el archivo se vuelve flaky —pasaba solo y
// fallaba dentro de la suite completa—. Un tick dentro de `act` las drena.
afterEach(async () => {
  await act(async () => {});
});

describe('el panel muestra a quién se suspendió', () => {
  it('lista las cuentas suspendidas con su nombre', async () => {
    mockSuspendidos.mockResolvedValue([SUSPENDIDA]);
    const arbol = await montar();
    expect(textos(arbol)).toContain('Bob');
  });

  it('dice que no hay ninguna cuando la lista viene vacía', async () => {
    const arbol = await montar();
    expect(textos(arbol)).toContain('No hay cuentas suspendidas');
  });
});

describe('reactivar', () => {
  it('el botón llama a reactivar con el id del usuario', async () => {
    mockSuspendidos.mockResolvedValue([SUSPENDIDA]);
    const arbol = await montar();

    const btn = botones(arbol, 'Reactivar');
    expect(btn).toHaveLength(1);
    await act(async () => {
      await btn[0].props.onPress();
    });

    expect(mockReactivar).toHaveBeenCalledWith('u-bob');
  });

  it('vuelve a pedir la lista después de reactivar', async () => {
    mockSuspendidos.mockResolvedValue([SUSPENDIDA]);
    const arbol = await montar();
    const llamadasAntes = mockSuspendidos.mock.calls.length;

    await act(async () => {
      await botones(arbol, 'Reactivar')[0].props.onPress();
    });

    expect(mockSuspendidos.mock.calls.length).toBeGreaterThan(llamadasAntes);
  });

  it('avisa cuando la RPC rechaza (p. ej. la cuenta ya no estaba suspendida)', async () => {
    mockSuspendidos.mockResolvedValue([SUSPENDIDA]);
    mockReactivar.mockRejectedValue({ code: 'P0001', message: 'la cuenta no esta suspendida' });
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Reactivar')[0].props.onPress();
    });

    expect(mockNotify).toHaveBeenCalled();
    const titulos = mockNotify.mock.calls.map((c) => c[0]);
    expect(titulos).not.toContain('Listo');
  });
});

describe('si no se pueden leer las suspendidas, no se dice que no hay ninguna', () => {
  it('muestra el fallo y NO el vacío', async () => {
    mockSuspendidos.mockRejectedValue({ code: 'PGRST202', message: 'no existe la función' });
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).not.toContain('No hay cuentas suspendidas');
    expect(t).toContain('No pudimos leer las cuentas suspendidas');
  });

  it('ofrece reintentar, y el reintento vuelve a preguntar', async () => {
    mockSuspendidos.mockRejectedValue({ code: 'PGRST202' });
    const arbol = await montar();
    const llamadasAntes = mockSuspendidos.mock.calls.length;

    const btn = botones(arbol, 'Reintentar');
    expect(btn).toHaveLength(1);
    mockSuspendidos.mockResolvedValue([SUSPENDIDA]);
    await act(async () => {
      await btn[0].props.onPress();
    });

    expect(mockSuspendidos.mock.calls.length).toBeGreaterThan(llamadasAntes);
    expect(textos(arbol)).toContain('Bob');
  });

  it('la bandeja de denuncias sigue funcionando aunque falle esa lectura', async () => {
    // Son dos lecturas independientes: la denuncia es el trabajo principal del
    // panel y no se cae porque la lista de suspendidos no se pueda leer.
    mockBandeja.mockResolvedValue([
      {
        id: 'd1', tipo: 'pista', motivo: 'Spam', detalle: null, creadoEn: 'x',
        reporterId: 'r', reporterNombre: 'Ana', denunciadoId: 'u-bob',
        denunciadoNombre: 'Bob', objetoId: 'o', petId: null,
        denunciasContraDenunciado: 1, contenido: { texto: 'compra pastillas' },
      },
    ]);
    mockSuspendidos.mockRejectedValue({ code: 'PGRST202' });
    const arbol = await montar();

    expect(textos(arbol)).toContain('compra pastillas');
    expect(botones(arbol, 'Retirar')).toHaveLength(1);
  });
});
