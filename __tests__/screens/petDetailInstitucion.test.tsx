import React from 'react';
import { act, create } from 'react-test-renderer';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import InsigniaInstitucion from '../../src/components/InsigniaInstitucion';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// UNA PUBLICACIÓN DE UNA INSTITUCIÓN VERIFICADA SE VE DISTINTA (migración 0057).
//
// La ficha del reporte es la pantalla más importante del producto y ya tiene la
// fila "Publicado por …". Ahí es donde el sello vale: quien mira un animal
// encontrado y lee "Publicado por Vet Ñuñoa · Veterinaria verificada" sabe a
// dónde ir, y sabe que no le está escribiendo a un desconocido.
//
// Las dos reglas duras:
//   · sin verificación, la ficha se ve EXACTAMENTE como ayer;
//   · con la 0057 sin aplicar también, porque el select de las columnas nuevas
//     devuelve 42703 y `getAutorPublico` reintenta con el de siempre. Si eso
//     fallara, desaparecería la firma de TODAS las fichas.

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
  useAuth: () => ({ user: { id: 'un-vecino' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

let mockPet: any;
jest.mock('../../src/services/pets', () => ({
  getPet: jest.fn(() => Promise.resolve(mockPet)),
  archivarReporte: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));

const PET = {
  id: 'pet-1',
  user_id: 'la-vet',
  estado: 'encontrada',
  especie: 'perro',
  nombre: 'Rocco',
  raza: null,
  descripcion: 'Marrón, collar rojo.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  comuna: 'Ñuñoa',
  recompensa: null,
  activo: true,
  oculto: false,
  reunida_en: null,
  creado_en: new Date().toISOString(),
  renovado_en: new Date().toISOString(),
  preguntado_en: null,
  cierre_motivo: null,
};

jest.mock('../../src/services/cierreCasos', () => ({ responderEstado: jest.fn() }));
jest.mock('../../src/services/cuadrilla', () => ({
  estadoDeCuadrilla: jest.fn(() => Promise.resolve({ tipo: 'no-disponible' })),
}));
jest.mock('../../src/services/sightings', () => ({
  listSightings: jest.fn(() => Promise.resolve([])),
  deleteSighting: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/busqueda', () => ({
  buscarCoincidencias: jest.fn(() => Promise.resolve([])),
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

const mockGetAutor = jest.fn();
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
  getNombrePublico: jest.fn(() => Promise.resolve('NO-USAR')),
  getAutorPublico: (...a: any[]) => mockGetAutor(...a),
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
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

const VETERINARIA = {
  tipo: 'veterinaria' as const,
  nombre: 'Clínica Veterinaria Ñuñoa',
  comuna: 'Ñuñoa',
  contacto: '+56 9 1234 5678',
};

const montados: any[] = [];

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PetDetailScreen
          route={{ params: { id: 'pet-1' } }}
          navigation={{ navigate: jest.fn(), goBack: jest.fn(), addListener: () => () => {}, setOptions: () => {} }}
        />
      </ThemeProvider>,
    );
  });
  // Igual que en petDetailCierre: la ficha encadena varias cargas asíncronas y
  // un solo `act` vacío no alcanza para que se asienten todas.
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  montados.push(arbol);
  return arbol;
}

// Cada nodo de texto ARMADO ENTERO: `Publicado por {nombre}` son dos hijos y
// una búsqueda por la frase completa no lo encontraría partido.
function textos(arbol: any): string {
  return (arbol.root ?? arbol)
    .findAll((n: any) => Array.isArray(n.children) && n.children.some((c: any) => typeof c === 'string'))
    .map((n: any) => n.children.filter((c: any) => typeof c === 'string').join(''))
    .join(' | ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPet = { ...PET };
  mockGetAutor.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('la firma "Publicado por" muestra el sello institucional', () => {
  it('una veterinaria verificada lleva su sello al lado del nombre', async () => {
    mockGetAutor.mockResolvedValue({ nombre: 'Vet Ñuñoa', institucion: VETERINARIA });
    const t = textos(await montar());
    expect(t).toContain('Publicado por');
    expect(t).toContain('Vet Ñuñoa');
    expect(t).toContain('Veterinaria verificada');
  });

  it('el sello es COMPACTO: no repite el nombre ni escupe el teléfono en la ficha', async () => {
    // El nombre ya está en la línea de arriba y el contacto vive en el perfil
    // público, a un toque. Meterlo acá convertiría la firma en una tarjeta.
    mockGetAutor.mockResolvedValue({ nombre: 'Vet Ñuñoa', institucion: VETERINARIA });
    const arbol = await montar();
    const sello = textos(arbol.root.findByType(InsigniaInstitucion));
    expect(sello).toContain('Veterinaria verificada');
    expect(sello).not.toContain('Clínica Veterinaria Ñuñoa');
    expect(sello).not.toContain('+56 9 1234 5678');
  });

  it('una persona común firma como siempre, sin sello', async () => {
    mockGetAutor.mockResolvedValue({ nombre: 'Ana', institucion: null });
    const t = textos(await montar());
    expect(t).toContain('Publicado por');
    expect(t).toContain('Ana');
    expect(t).not.toContain('verificad');
  });

  it('si no se puede leer al autor, la ficha se lee entera igual (sin la fila)', async () => {
    mockGetAutor.mockResolvedValue(null);
    const t = textos(await montar());
    expect(t).not.toContain('Publicado por');
    expect(t).toContain('Rocco');
  });

  it('la ficha usa getAutorPublico, no dos consultas separadas', async () => {
    mockGetAutor.mockResolvedValue({ nombre: 'Ana', institucion: null });
    await montar();
    expect(mockGetAutor).toHaveBeenCalledWith('la-vet');
    // `getNombrePublico` sigue existiendo para AdopcionDetail, pero esta
    // pantalla ya no la usa: si la llamara, estaría pidiendo la misma fila dos
    // veces (el mock devuelve 'NO-USAR' justamente para que se note).
    const t = textos(await montar());
    expect(t).not.toContain('NO-USAR');
  });
});
