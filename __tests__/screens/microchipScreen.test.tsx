import React from 'react';
import { act, create } from 'react-test-renderer';
import { Linking, Text, TouchableOpacity } from 'react-native';
import MicrochipScreen from '../../src/screens/MicrochipScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import {
  DOMINIOS_CAIDOS,
  REGISTROS_CAIDOS,
  REGISTROS_CONSULTABLES,
  URL_REGISTRO_NACIONAL,
  dominioDe,
} from '../../src/data/registrosChip';

// La pantalla se RENDERIZA de verdad y se TOCAN los botones: lo que importa acá
// no es que compile, sino que cada fila abra la URL exacta que se verificó a
// mano y que las que están muertas no se puedan abrir de ninguna manera.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('../../src/lib/temaPref', () => ({
  getTemaPref: () => Promise.resolve('auto'),
  setTemaPref: jest.fn(() => Promise.resolve()),
}));

let abiertas: string[] = [];

beforeEach(() => {
  abiertas = [];
  jest.spyOn(Linking, 'openURL').mockImplementation((url: string) => {
    abiertas.push(url);
    return Promise.resolve(true);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <MicrochipScreen />
      </ThemeProvider>,
    );
  });
  return arbol;
}

function textoVisible(arbol: any): string {
  return arbol.root
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

/** Toca TODO lo tocable de la pantalla y devuelve las URLs que se abrieron. */
async function tocarTodo(arbol: any): Promise<string[]> {
  const tocables = arbol.root
    .findAllByType(TouchableOpacity)
    .filter((t: any) => typeof t.props.onPress === 'function');
  for (const t of tocables) {
    await act(async () => {
      t.props.onPress();
    });
  }
  return abiertas;
}

describe('la pantalla del microchip se monta sin sesión ni navegación real', () => {
  it('renderiza', async () => {
    const arbol = await montar();
    expect(textoVisible(arbol).length).toBeGreaterThan(200);
  });
});

describe('explica el chip en 20 segundos', () => {
  it('aclara que NO es un GPS y que leerlo es gratis', async () => {
    const texto = textoVisible(await montar()).toLowerCase();
    expect(texto).toContain('gps');
    expect(texto).toContain('gratis');
  });

  it('nombra la Ley 21.020 y que inscribirlo es obligatorio', async () => {
    const texto = textoVisible(await montar()).toLowerCase();
    expect(texto).toContain('21.020');
    expect(texto).toContain('obligator');
  });

  it('avisa que el número hay que pegarlo a mano (no hay consulta unificada)', async () => {
    const texto = textoVisible(await montar()).toLowerCase();
    expect(texto).toMatch(/a mano|peg[áa]/);
  });
});

describe('los botones abren exactamente las URLs verificadas', () => {
  it('abre la búsqueda de veterinarias en el mapa del teléfono', async () => {
    const urls = await tocarTodo(await montar());
    const mapas = urls.filter((u) => u.startsWith('https://www.google.com/maps/search/'));
    expect(mapas.length).toBeGreaterThanOrEqual(2);
    expect(mapas.some((u) => u.includes(encodeURIComponent('veterinaria')))).toBe(true);
  });

  it('abre cada registro consultable', async () => {
    const urls = await tocarTodo(await montar());
    for (const r of REGISTROS_CONSULTABLES) {
      expect(urls).toContain(r.url);
    }
  });

  it('ofrece inscribir en el Registro Nacional', async () => {
    const urls = await tocarTodo(await montar());
    expect(urls).toContain(URL_REGISTRO_NACIONAL);
  });

  it('NINGÚN toque abre un dominio muerto', async () => {
    const urls = await tocarTodo(await montar());
    const muertas = urls.filter((u) => DOMINIOS_CAIDOS.includes(dominioDe(u)));
    expect(muertas).toEqual([]);
  });

  it('todo lo que abre es https', async () => {
    const urls = await tocarTodo(await montar());
    expect(urls.length).toBeGreaterThan(3);
    expect(urls.filter((u) => !u.startsWith('https://'))).toEqual([]);
  });
});

describe('los registros muertos se nombran, para que nadie los googlee', () => {
  it('aparecen por nombre con el motivo, como texto y no como enlace', async () => {
    const texto = textoVisible(await montar());
    for (const r of REGISTROS_CAIDOS) {
      expect(texto).toContain(r.dominio);
    }
  });
});
