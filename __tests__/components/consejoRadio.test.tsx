import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ConsejoRadio } from '../../src/components/ConsejoRadio';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LO QUE SE LE SUGIERE AL DUEÑO, Y QUE SIGA ANDANDO SIN LA MIGRACIÓN 0046.
//
// `pet.ambito` llega `undefined` en tres casos que para quien lee significan lo
// mismo ("no sabemos"): la 0046 no está aplicada, el reporte es anterior a
// ella, o la persona omitió la pregunta. En los tres el radio tiene que ser el
// ANCHO. Si la falta de la columna achicara la búsqueda, una base sin migrar
// mandaría a la gente a buscar a su gato en la cuadra de al lado.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const AHORA = new Date('2026-08-01T12:00:00Z').getTime();
const DIA = 24 * 60 * 60 * 1000;

function haceDias(n: number): string {
  return new Date(AHORA - n * DIA).toISOString();
}

async function textoDe(pet: any): Promise<string> {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ConsejoRadio pet={pet} now={AHORA} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  const t = arbol.root
    .findAllByType(Text)
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
  await act(async () => arbol.unmount());
  return t;
}

const GATO = { especie: 'gato' as const, estado: 'perdida' as const, creado_en: haceDias(0) };

describe('degrada sin la columna `ambito`', () => {
  it('sin el dato usa el radio ANCHO, el mismo que un gato con calle', async () => {
    const sinColumna = await textoDe({ ...GATO }); // `ambito` ni siquiera existe
    const nulo = await textoDe({ ...GATO, ambito: null });
    const conCalle = await textoDe({ ...GATO, ambito: 'exterior' });
    expect(sinColumna).toBe(conCalle);
    expect(nulo).toBe(conCalle);
    // Y NO el de interior, que es seis veces más chico.
    expect(sinColumna).not.toBe(await textoDe({ ...GATO, ambito: 'interior' }));
  });

  it('un valor basura en la columna tampoco achica la búsqueda', async () => {
    // Una fila escrita a mano, o un ámbito nuevo que la app todavía no conoce.
    const basura = await textoDe({ ...GATO, ambito: 'patio' as any });
    expect(basura).toBe(await textoDe({ ...GATO, ambito: 'exterior' }));
  });
});

describe('lo que se muestra', () => {
  it('el gato de interior manda a buscar en metros, no en kilómetros', async () => {
    const texto = await textoDe({ ...GATO, ambito: 'interior' });
    expect(texto).toMatch(/Buscá\s+\d+ m\s+a la redonda/);
    // Y dice POR QUÉ, que es lo que evita que se lea como un error de la app.
    expect(texto.toLowerCase()).toContain('puerta por puerta');
  });

  it('el perro manda a buscar en kilómetros', async () => {
    const texto = await textoDe({ especie: 'perro', estado: 'perdida', creado_en: haceDias(0) });
    expect(texto).toMatch(/Buscá\s+\d+(,\d)? km\s+a la redonda/);
  });

  it('con los días amplía el círculo y lo dice', async () => {
    const dia0 = await textoDe({ especie: 'perro', estado: 'perdida', creado_en: haceDias(0) });
    const dia10 = await textoDe({ especie: 'perro', estado: 'perdida', creado_en: haceDias(10) });
    expect(dia10).not.toBe(dia0);
    expect(dia10).toContain('ampliamos');
    expect(dia0).not.toContain('ampliamos');
  });

  it('no aparece en un reporte de mascota ENCONTRADA', async () => {
    // Ya está a resguardo: no hay nada que rastrillar.
    expect(await textoDe({ ...GATO, estado: 'encontrada' })).toBe('');
  });
});
