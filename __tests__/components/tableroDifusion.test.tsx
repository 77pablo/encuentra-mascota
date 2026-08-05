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

it('A1: un destino tipo lugar muestra su NOMBRE, no "Destino" a secas', async () => {
  // El CHECK de la 0063 obliga `etiqueta null` para tipo 'lugar': el nombre
  // solo puede venir del join contra `lugares` (lugarNombre, services/difusion.ts).
  // Con el código viejo (sin el join ni el fallback en `etiquetaDe`) este test
  // queda en ROJO: la fila mostraba "Destino" a secas.
  (listarDestinos as jest.Mock).mockResolvedValue({
    tipo: 'listo',
    destinos: [
      {
        id: 'd1',
        petId: 'p1',
        tipo: 'lugar',
        etiqueta: null,
        lugarId: 'l1',
        lugarNombre: 'Veterinaria Los Robles',
        institucionId: null,
        estado: 'pendiente',
        avisadoEn: null,
        creadoEn: '2026-08-03T00:00:00.000Z',
      },
    ],
  });
  const arbol = await montar({ pet });
  expect(textoDe(arbol)).toMatch(/Veterinaria Los Robles/);
  expect(textoDe(arbol)).not.toMatch(/^Destino$/m);
});

it('A1: la atribución OSM sale también cuando el tablero solo tiene destinos tipo lugar (sin "Cerca tuyo")', async () => {
  (listarDestinos as jest.Mock).mockResolvedValue({
    tipo: 'listo',
    destinos: [
      {
        id: 'd1',
        petId: 'p1',
        tipo: 'lugar',
        etiqueta: null,
        lugarId: 'l1',
        lugarNombre: 'Veterinaria Los Robles',
        institucionId: null,
        estado: 'pendiente',
        avisadoEn: null,
        creadoEn: '2026-08-03T00:00:00.000Z',
      },
    ],
  });
  // Sin lugares cerca (lugaresCerca ya mockea [] en el beforeEach): la sección
  // "Cerca tuyo" no se monta, pero el nombre de OSM sigue en pantalla en la
  // lista de destinos, así que el crédito tiene que seguir ahí.
  const arbol = await montar({ pet });
  expect(textoDe(arbol)).toMatch(/colaboradores de OpenStreetMap/i);
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

it('un corte de red NO hace desaparecer el tablero: queda algo para reintentar', async () => {
  // Restricción global de la tanda 14: "La migración puede no estar aplicada:
  // la sección queda simplemente ausente. Pero un corte de red NO es lo
  // mismo: se propaga, para que haya algo que reintentar." `listarDestinos`
  // sólo devuelve `{ tipo: 'no-disponible' }` para la migración ausente; un
  // error de red lo relanza (ver services/difusion.ts). El componente NO
  // puede tratar ambos casos igual.
  (listarDestinos as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));
  const arbol = await montar({ pet });

  // No es null: queda algo en pantalla.
  expect(arbol.toJSON()).not.toBeNull();
  // Y hay de dónde reintentar.
  const t = textoDe(arbol);
  expect(t).toMatch(/no pudimos|conexión|no salió bien/i);

  // Reintentar vuelve a llamar al servicio.
  (listarDestinos as jest.Mock).mockClear();
  (listarDestinos as jest.Mock).mockResolvedValue({ tipo: 'listo', destinos: [] });
  // Se busca por el título del botón en vez de asumir de qué tipo de
  // elemento de UI está hecho: alcanza con que EXISTA una acción de
  // "Reintentar" que vuelva a llamar al servicio.
  const instanciasBoton = arbol.root.findAll(
    (n: any) => typeof n.props.onPress === 'function' && n.props.title === 'Reintentar',
  );
  expect(instanciasBoton.length).toBeGreaterThan(0);
  await act(async () => {
    instanciasBoton[0].props.onPress();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(listarDestinos).toHaveBeenCalled();
});

// El guardián de "CuadrillaScreen puede generar el afiche sin ser el dueño"
// vivía acá como un match de texto sobre el código fuente
// (`not.toMatch(/esMio\s*&&\s*<AficheGenerator/)`), y una revisión demostró que
// es demasiado literal: reintroducir la regresión como
// `esMio && generandoAfiche && pet ? (<AficheGenerator ...` la dejaba pasar en
// verde igual, porque el substring exacto ya no aparecía. Se movió a
// `__tests__/screens/cuadrillaDosAyudantes.test.tsx` ("Ana, que NO es la
// dueña, también puede generar el afiche"), que en vez de mirar el TEXTO monta
// la pantalla de verdad como alguien que no es el dueño y comprueba que el
// generador se MONTE — así una regresión se nota pase lo que pase con el
// nombre de la variable o el orden de la condición.
