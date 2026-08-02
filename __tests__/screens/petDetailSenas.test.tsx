import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import PetDetailScreen, { resumenDeSenas } from '../../src/screens/PetDetailScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA FICHA DEL REPORTE CON SEÑAS (migración 0054).
//
// Dos cosas:
//
//  1. Las señas se ven, y NO dejan huecos cuando no están (que es el caso de
//     todos los reportes anteriores a la migración y de cualquier base sin
//     ella: ahí las claves ni siquiera llegan en la fila de `pets`).
//  2. Cuando el chip coincide, la coincidencia LO DICE. Sin eso, esa tarjeta se
//     ve idéntica a las otras diez y la persona la pasa de largo — y de todo lo
//     que produce el motor, es la única que es casi una certeza.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));
jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: (_props: any) => null,
}));
jest.mock('../../src/components/AficheGenerator', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/TarjetaGenerador', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/PetCard', () => ({ __esModule: true, default: () => null }));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'otra-persona' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

let mockPet: any;
jest.mock('../../src/services/pets', () => ({
  getPet: jest.fn(() => Promise.resolve(mockPet)),
  archivarReporte: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));

let mockMatches: any[] = [];
jest.mock('../../src/services/busqueda', () => ({
  buscarCoincidencias: jest.fn(() => Promise.resolve(mockMatches)),
}));

jest.mock('../../src/services/cierreCasos', () => ({ responderEstado: jest.fn() }));
jest.mock('../../src/services/cuadrilla', () => ({
  estadoDeCuadrilla: jest.fn(() => Promise.resolve({ tipo: 'no-disponible' })),
}));
jest.mock('../../src/services/sightings', () => ({
  listSightings: jest.fn(() => Promise.resolve([])),
  deleteSighting: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/reunions', () => ({ markReunited: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/services/petUpdates', () => ({
  listUpdates: jest.fn(() => Promise.resolve([])),
  addUpdate: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/tips', () => ({
  listarTips: jest.fn(() => Promise.resolve([])),
  crearTip: jest.fn(() => Promise.resolve()),
  borrarTip: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/storage', () => ({ uploadPetPhoto: jest.fn() }));
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
  getNombrePublico: jest.fn(() => Promise.resolve('Ana')),
}));
jest.mock('../../src/services/moderation', () => ({
  ...jest.requireActual('../../src/services/moderation'),
  denunciarReporte: jest.fn(() => Promise.resolve()),
  denunciarPista: jest.fn(() => Promise.resolve()),
  denunciarAvistamiento: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/lib/pickImage', () => ({
  pickFromLibrary: jest.fn(() => Promise.resolve([])),
  takePhoto: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../src/lib/share', () => ({ shareReport: jest.fn() }));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(() => Promise.resolve(true)),
}));

const BASE = {
  id: 'p1',
  user_id: 'la-dueña',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Pelusa',
  descripcion: 'Se escapó del patio.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: new Date().toISOString(),
};

const montados: any[] = [];

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PetDetailScreen
          route={{ params: { id: 'p1' } }}
          navigation={{
            navigate: jest.fn(),
            push: jest.fn(),
            goBack: jest.fn(),
            setOptions: jest.fn(),
            addListener: () => () => {},
          }}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

function textoDe(arbol: any): string {
  return arbol.root
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' | ');
}

beforeEach(() => {
  mockPet = { ...BASE };
  mockMatches = [];
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('resumenDeSenas', () => {
  it('traduce los valores de la base a lo que se lee', () => {
    expect(
      resumenDeSenas({ ...BASE, colores: ['negro', 'cafe'], tamano: 'grande', sexo: 'hembra' } as any),
    ).toEqual(['Negro', 'Café', 'Grande', 'Hembra']);
  });

  it('sin señas no devuelve nada (ni un hueco ni un "no sé")', () => {
    // Todos los reportes anteriores a la 0054 caen acá, y también CUALQUIER
    // reporte si la migración no está aplicada: ahí las claves ni siquiera
    // llegan en la fila.
    expect(resumenDeSenas(BASE as any)).toEqual([]);
    expect(resumenDeSenas({ ...BASE, colores: null, tamano: null, sexo: null } as any)).toEqual([]);
  });

  it('"no sé" no ocupa un chip', () => {
    // Un chip que dice "No sé" es ruido: lo que no está ya se entiende que no
    // se sabe. Pero el valor SÍ se guarda, porque para el motor no es lo mismo
    // "no contestó" que "contestó que no sabe".
    expect(resumenDeSenas({ ...BASE, sexo: 'no_se', esterilizado: 'no_se' } as any)).toEqual([]);
  });

  it('ignora un color que no conoce en vez de dibujar undefined', () => {
    // La base puede tener valores de una versión más nueva que la del cliente.
    // `toStrictEqual` y no `toEqual`: este último da por buena una lista con un
    // `undefined` de más, que es justo lo que se dibujaría como un chip vacío.
    const salida = resumenDeSenas({ ...BASE, colores: ['negro', 'fucsia'] } as any);
    expect(salida).toStrictEqual(['Negro']);
    expect(salida.every((s) => typeof s === 'string')).toBe(true);
  });
});

describe('la ficha', () => {
  it('muestra las señas del reporte', async () => {
    mockPet = { ...BASE, colores: ['negro'], tamano: 'grande' };
    const arbol = await montar();
    const texto = textoDe(arbol);
    expect(texto).toContain('Negro');
    expect(texto).toContain('Grande');
  });

  it('sin la 0054 aplicada se ve exactamente igual que ayer', async () => {
    const arbol = await montar();
    expect(textoDe(arbol)).toContain('Se escapó del patio.');
  });
});

describe('la coincidencia por chip se distingue de las demás', () => {
  const match = (extra: any) => ({
    id: 'p2',
    estado: 'encontrada',
    especie: 'perro',
    nombre: null,
    descripcion: 'Lo encontré en la plaza',
    fotos: [],
    lat: -33.4,
    lng: -70.6,
    creado_en: new Date().toISOString(),
    distancia_km: 1.2,
    ...extra,
  });

  it('lo dice cuando el chip coincide', async () => {
    mockMatches = [match({ chip_coincide: true, puntaje: 1019 })];
    const arbol = await montar();
    expect(textoDe(arbol)).toContain('El chip coincide');
  });

  it('NO lo dice cuando no coincide', async () => {
    // Si el cartel saliera en todas, dejaría de significar algo — y prometerle
    // una certeza a alguien desesperado por una coincidencia normal es
    // exactamente el daño que esta función viene a reducir.
    mockMatches = [match({ chip_coincide: false, puntaje: 19 })];
    const arbol = await montar();
    expect(textoDe(arbol)).not.toContain('El chip coincide');
  });

  it('tampoco cuando la RPC vieja ni siquiera devuelve el campo', async () => {
    mockMatches = [match({})];
    const arbol = await montar();
    expect(textoDe(arbol)).not.toContain('El chip coincide');
  });

  it('nunca aparece un número de chip en pantalla', async () => {
    // La RPC no lo devuelve, así que no habría de dónde sacarlo. Este test es
    // el que se pondría rojo si alguien lo agregara al retorno "para mostrarlo".
    mockMatches = [match({ chip_coincide: true, chip: '985112003456789' })];
    const arbol = await montar();
    expect(textoDe(arbol)).not.toContain('985112003456789');
  });
});
