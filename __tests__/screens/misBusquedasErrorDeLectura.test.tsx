import React from 'react';
import { act, create } from 'react-test-renderer';
import MisBusquedasScreen from '../../src/screens/MisBusquedasScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// "NO PUDIMOS LEER TUS BÚSQUEDAS" NO ES "TODAVÍA NO GUARDASTE NINGUNA".
//
// Es el tercer caso de la misma familia en este repo (el perfil degradado que
// guardaba '' encima del teléfono, y AlertZoneScreen mostrando los valores por
// defecto como si fueran tu configuración). Acá el catch dejaba `busquedas` en
// `[]` y la pantalla anunciaba el vacío: con el wifi caído, alguien que tiene
// tres avisos guardados lee que no tiene ninguno y los vuelve a crear
// duplicados —o peor, deja de confiar en que los avisos existan.
//
// El arreglo copia el que ya está bien resuelto en AlertZoneScreen: se dice que
// no se pudo leer, no se muestra el vacío, y se ofrece reintentar.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, [cb]);
  },
}));

const mockListBusquedas = jest.fn();
jest.mock('../../src/services/busquedasGuardadas', () => ({
  listBusquedas: () => mockListBusquedas(),
  borrarBusqueda: jest.fn(() => Promise.resolve()),
  guardarBusqueda: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(true),
}));

const GUARDADA = {
  id: 'b1',
  user_id: 'yo',
  tipo: 'perdida' as const,
  especie: 'gato' as const,
  comuna: 'Ñuñoa',
  creado_en: '2026-07-01T10:00:00Z',
};

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <MisBusquedasScreen />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && textos(arbol).includes('Cargando'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  await act(async () => {});
  return arbol;
}

let errorEspiado: jest.SpyInstance;
beforeEach(() => {
  mockListBusquedas.mockReset().mockResolvedValue([]);
  // El arreglo deja rastro del fallo en consola (regla de "ningún error mudo");
  // sin esto, el test escupe el error rojo en medio de la corrida.
  errorEspiado = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  errorEspiado.mockRestore();
  await act(async () => {});
});

describe('cuando la lectura falla', () => {
  it('NO dice que no guardaste ninguna búsqueda', async () => {
    mockListBusquedas.mockRejectedValue({ message: 'Network request failed' });
    const arbol = await montar();
    expect(textos(arbol)).not.toContain('Todavía no guardaste ninguna búsqueda');
  });

  it('dice que no se pudieron leer', async () => {
    mockListBusquedas.mockRejectedValue({ message: 'Network request failed' });
    const arbol = await montar();
    expect(textos(arbol)).toContain('No pudimos leer tus búsquedas');
  });

  it('deja claro que siguen guardadas', async () => {
    mockListBusquedas.mockRejectedValue({ message: 'Network request failed' });
    const arbol = await montar();
    expect(textos(arbol)).toContain('siguen guardadas');
  });

  it('ofrece reintentar, y el reintento vuelve a preguntar', async () => {
    mockListBusquedas.mockRejectedValue({ message: 'Network request failed' });
    const arbol = await montar();

    const reintentar = botones(arbol).find((b: any) => /reintentar/i.test(b.props.title));
    expect(reintentar).toBeTruthy();

    const antes = mockListBusquedas.mock.calls.length;
    mockListBusquedas.mockResolvedValue([GUARDADA]);
    await act(async () => {
      reintentar.props.onPress();
    });
    await act(async () => {});

    expect(mockListBusquedas.mock.calls.length).toBeGreaterThan(antes);
    expect(textos(arbol)).toContain('Ñuñoa');
  });

  it('el fallo queda escrito en algún lado (si no, no hay cómo diagnosticarlo)', async () => {
    mockListBusquedas.mockRejectedValue({ message: 'Network request failed' });
    await montar();
    expect(errorEspiado).toHaveBeenCalled();
  });
});

describe('cuando la lectura funciona, nada cambia', () => {
  it('la lista vacía de verdad sí anuncia el vacío', async () => {
    const arbol = await montar();
    expect(textos(arbol)).toContain('Todavía no guardaste ninguna búsqueda');
  });

  it('con búsquedas guardadas, las muestra', async () => {
    mockListBusquedas.mockResolvedValue([GUARDADA]);
    const arbol = await montar();
    expect(textos(arbol)).toContain('Ñuñoa');
    expect(textos(arbol)).not.toContain('No pudimos leer tus búsquedas');
  });
});
