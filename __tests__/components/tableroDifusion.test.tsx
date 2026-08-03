import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL TABLERO DE DIFUSIÓN, EN PANTALLA.
//
// OJO: este repo no tiene instalado `@testing-library/react-native` (ningún
// otro test de `__tests__/components` lo usa; todos montan con
// `react-test-renderer` + `ThemeProvider`, ver `planBusqueda.test.tsx` y
// `consejoRadio.test.tsx`). Se sigue ese mismo patrón acá, con las MISMAS
// afirmaciones que pedía el plan.

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('../../src/services/difusion', () => ({
  listarDestinos: jest.fn(),
  lugaresCerca: jest.fn(),
  agregarPersona: jest.fn(),
  agregarLugar: jest.fn(),
  marcarAvisado: jest.fn(),
  borrarDestino: jest.fn(),
}));

import { listarDestinos, lugaresCerca } from '../../src/services/difusion';
import { TableroDifusion } from '../../src/components/TableroDifusion';

const pet = {
  id: 'p1',
  especie: 'perro' as const,
  comuna: 'Ñuñoa',
  creado_en: '2026-08-01T10:00:00Z',
  ambito: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (lugaresCerca as jest.Mock).mockResolvedValue([]);
});

// `cargar()` encadena DOS promesas reales (listarDestinos y, si corresponde,
// lugaresCerca): un solo `act(async () => {})` no alcanza a drenar las dos.
async function montar(props: { pet: any; onAfiche?: () => void }) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <TableroDifusion {...props} />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return arbol;
}

function textoDe(arbol: any): string {
  return arbol.root
    .findAllByType(Text)
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' | ');
}

it('con la migracion sin aplicar no renderiza nada (la ficha sigue igual)', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'no-disponible' });
  const arbol = await montar({ pet });
  expect(listarDestinos).toHaveBeenCalled();
  expect(arbol.toJSON()).toBeNull();
});

it('atribuye a OpenStreetMap cuando muestra lugares (ODbL lo obliga)', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  (lugaresCerca as jest.Mock).mockResolvedValue([
    {
      id: 'l1',
      nombre: 'Vet Central',
      categoria: 'veterinaria',
      lat: -33.4,
      lng: -70.6,
      direccion: 'Irarrázaval 100',
      comuna: 'Ñuñoa',
      distanciaKm: 0.4,
    },
  ]);
  const arbol = await montar({ pet });
  expect(textoDe(arbol)).toMatch(/colaboradores de OpenStreetMap/i);
});

it('NO promete telefono: no dice "llamá a" ni muestra un numero inventado', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  (lugaresCerca as jest.Mock).mockResolvedValue([
    {
      id: 'l1',
      nombre: 'Vet Central',
      categoria: 'veterinaria',
      lat: -33.4,
      lng: -70.6,
      direccion: null,
      comuna: 'Ñuñoa',
      distanciaKm: 0.4,
    },
  ]);
  const arbol = await montar({ pet });
  expect(lugaresCerca).toHaveBeenCalled();
  expect(textoDe(arbol)).not.toMatch(/llamá a|llamar a|teléfono:/i);
  expect(JSON.stringify(arbol.toJSON())).not.toMatch(/\+56\s?9/);
});

it('el radio de los lugares sale de radioSugerido, no de un numero escrito a mano', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  // Reloj fijo: el radio se amplia con los dias, asi que sin fijarlo el test
  // se pondria rojo solo con el paso del tiempo.
  jest.useFakeTimers().setSystemTime(new Date('2026-08-03T10:00:00Z'));
  const { radioSugerido } = require('../../src/lib/radioSugerido');
  const esperado = radioSugerido({ especie: 'perro', ambito: undefined, dias: 2 }).km;

  await montar({ pet });
  expect(lugaresCerca).toHaveBeenCalled();

  const radioUsado = (lugaresCerca as jest.Mock).mock.calls[0][1];
  expect(typeof radioUsado).toBe('number'); // NO el objeto entero
  expect(radioUsado).toBe(esperado);
  jest.useRealTimers();
});

it('el componente NO tiene un radio escrito a mano', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'TableroDifusion.tsx'),
    'utf8',
  );
  expect(fuente).toMatch(/radioSugerido/);
  // Un literal de km suelto seria la segunda fuente de verdad que el
  // Critical #4 de la tanda 10 vino a matar.
  expect(fuente).not.toMatch(/lugaresCerca\([^,]+,\s*\d/);
});

it('CuadrillaScreen puede generar el afiche sin ser el dueño', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'screens', 'CuadrillaScreen.tsx'),
    'utf8',
  );
  expect(fuente).toMatch(/AficheGenerator/);
  // el gate de propiedad no debe envolver al generador
  expect(fuente).not.toMatch(/esMio\s*&&\s*<AficheGenerator/);
});
