import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { act, create } from 'react-test-renderer';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA FICHA DEL REPORTE CON LA MIGRACIÓN 0048 **SIN APLICAR**.
//
// Este es el escenario real, no uno hipotético: el dueño del proyecto sube la
// web cuando quiere y corre el SQL cuando puede. Durante ese rato la app está
// andando contra una base que NO tiene `cuadrillas`, y la ficha del reporte —
// la pantalla más importante del producto — tiene que funcionar EXACTAMENTE
// como el día anterior.
//
// LA TRAMPA QUE HAY QUE EVITAR, medida contra el proyecto real el 1-ago-2026:
//
//   GET /rest/v1/pets?select=id,estado,columna_que_no_existe
//   → 400 {"code":"42703","message":"column pets.columna_que_no_existe does not exist"}
//
// PostgREST NO devuelve datos parciales: la consulta falla ENTERA. Por eso la
// cuadrilla no le agrega ni una columna a `pets` y se lee en una consulta
// APARTE, cuyo fallo no puede arrastrar a la ficha.

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

let mockUsuarioActual = 'la-dueña';
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: mockUsuarioActual }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

let mockPet: any;
jest.mock('../../src/services/pets', () => ({
  getPet: jest.fn(() => Promise.resolve(mockPet)),
  archivarReporte: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));

const mockEstadoDeCuadrilla = jest.fn();
jest.mock('../../src/services/cuadrilla', () => ({
  estadoDeCuadrilla: (...a: any[]) => mockEstadoDeCuadrilla(...a),
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
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

const PET_BASE = {
  id: 'pet-1',
  user_id: 'la-dueña',
  estado: 'perdida',
  especie: 'perro',
  nombre: 'Rocco',
  raza: null,
  descripcion: 'Marrón, collar rojo.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  comuna: 'Maipú',
  recompensa: null,
  creado_en: '2026-07-25T10:00:00Z',
  renovado_en: '2026-07-25T10:00:00Z',
  activo: true,
  oculto: false,
  reunida_en: null,
};

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

function todoElTexto(arbol: any): string {
  return JSON.stringify(arbol.toJSON());
}

function boton(arbol: any, re: RegExp): any {
  return arbol.root.findAllByType(Button).find((b: any) => re.test(b.props.title));
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PetDetailScreen route={{ params: { id: 'pet-1' } }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  return arbol;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsuarioActual = 'la-dueña';
  mockPet = { ...PET_BASE };
  mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'sin-crear' });
});

// ───────────────────────────────────────────────────────────────────────────
describe('la ficha con la migración 0048 SIN aplicar', () => {
  it('sigue mostrando TODO lo de siempre', async () => {
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'no-disponible' });
    const arbol = await montar();
    const t = todoElTexto(arbol);

    // La ficha entera, igual que el día anterior.
    expect(t).toContain('Rocco');
    expect(t).toContain('Marrón, collar rojo.');
    expect(boton(arbol, /^Compartir$/)).toBeTruthy();
    expect(boton(arbol, /Volvió a casa/i)).toBeTruthy();
    expect(boton(arbol, /Crear afiche/i)).toBeTruthy();
    // Y ni rastro de error.
    expect(t).not.toMatch(/Algo no salió bien|no pudimos/i);
  });

  it('la sección de la cuadrilla NO aparece', async () => {
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'no-disponible' });
    const arbol = await montar();

    expect(todoElTexto(arbol).toLowerCase()).not.toContain('cuadrilla');
    expect(boton(arbol, /organizar la búsqueda|ver la cuadrilla/i)).toBeUndefined();
  });

  it('si la consulta de la cuadrilla LANZA, la ficha tampoco se entera', async () => {
    // Corte de red, un 500, un JWT vencido: pase lo que pase con esa consulta,
    // la ficha del reporte no puede mostrar un error por eso.
    mockEstadoDeCuadrilla.mockRejectedValue({ code: 'PGRST205', message: 'no está' });
    const arbol = await montar();

    expect(todoElTexto(arbol)).toContain('Marrón, collar rojo.');
    expect(boton(arbol, /organizar la búsqueda|ver la cuadrilla/i)).toBeUndefined();
    expect(boton(arbol, /reintentar/i)).toBeUndefined();
  });

  it('la cuadrilla se pregunta en una consulta APARTE de la del reporte', async () => {
    const { getPet } = require('../../src/services/pets');
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'no-disponible' });
    await montar();

    // Dos llamadas independientes: una a `pets`, otra a `cuadrillas`. Si la
    // cuadrilla viajara dentro de la consulta del reporte, el 42703 de
    // PostgREST se llevaría puesta la ficha entera.
    expect(getPet).toHaveBeenCalledWith('pet-1');
    expect(mockEstadoDeCuadrilla).toHaveBeenCalledWith('pet-1');
  });
});

// Guardrail estático: el servicio de reportes no puede enterarse de que la
// cuadrilla existe. Es la garantía estructural de todo lo de arriba.
describe('`pets` y la cuadrilla no se mezclan (chequeo sobre el código)', () => {
  const SRC = join(__dirname, '..', '..', 'src');
  const petsSrc = readFileSync(join(SRC, 'services', 'pets.ts'), 'utf8');

  it('services/pets.ts no menciona la cuadrilla en ninguna parte', () => {
    expect(petsSrc.toLowerCase()).not.toContain('cuadrilla');
  });

  it('getPet sigue leyendo con select("*"), sin lista de columnas', () => {
    // Con `select('*')` una columna nueva jamás rompe la consulta: PostgREST
    // devuelve lo que hay. El día que alguien lo cambie por una lista de
    // columnas, este test avisa antes de que se rompa en producción.
    expect(petsSrc).toMatch(/from\('pets'\)\s*\.select\('\*'\)\s*\.eq\('id', id\)/);
  });

  it('el servicio de la cuadrilla no toca la tabla pets', () => {
    const cuadrillaSrc = readFileSync(join(SRC, 'services', 'cuadrilla.ts'), 'utf8');
    expect(cuadrillaSrc).not.toMatch(/from\('pets'\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('la entrada a la cuadrilla desde la ficha', () => {
  it('el dueño de una perdida activa ve la invitación a organizar la búsqueda', async () => {
    const arbol = await montar();
    const b = boton(arbol, /organizar la búsqueda/i);
    expect(b).toBeTruthy();

    await act(async () => {
      b.props.onPress();
    });
    // La pantalla vive en el stack RAÍZ: desde acá (que está dentro del stack
    // de una pestaña) se alcanza por nombre pelado, burbujeando hacia arriba.
    expect(navigation.navigate).toHaveBeenCalledWith('Cuadrilla', { petId: 'pet-1' });
  });

  it('si ya está armada, la entrada dice "ver", no "organizar"', async () => {
    mockEstadoDeCuadrilla.mockResolvedValue({
      tipo: 'lista',
      cuadrilla: { id: 'c1', petId: 'pet-1', duenoId: 'la-dueña', token: 'tok', creadoEn: 'x' },
    });
    const arbol = await montar();
    expect(boton(arbol, /ver la cuadrilla/i)).toBeTruthy();
    expect(boton(arbol, /organizar la búsqueda/i)).toBeUndefined();
  });

  it('un vecino que YA se sumó también entra desde acá', async () => {
    // La RLS devuelve la fila a los miembros, no solo al dueño: para el que
    // ayuda, la ficha del reporte es el camino natural de vuelta al tablero.
    mockUsuarioActual = 'un-vecino';
    mockEstadoDeCuadrilla.mockResolvedValue({
      tipo: 'lista',
      cuadrilla: { id: 'c1', petId: 'pet-1', duenoId: 'la-dueña', token: 'tok', creadoEn: 'x' },
    });
    const arbol = await montar();
    expect(boton(arbol, /ver la cuadrilla/i)).toBeTruthy();
  });

  it('a un desconocido no se le ofrece armar la cuadrilla de otro', async () => {
    mockUsuarioActual = 'un-vecino';
    const arbol = await montar();
    expect(boton(arbol, /organizar la búsqueda/i)).toBeUndefined();
  });

  it('en un reporte "encontrada" no tiene sentido y no aparece', async () => {
    // Una cuadrilla organiza la búsqueda de un animal perdido. En el reporte de
    // alguien que ENCONTRÓ una mascota no hay barrio que recorrer.
    mockPet = { ...PET_BASE, estado: 'encontrada' };
    const arbol = await montar();
    expect(boton(arbol, /organizar la búsqueda/i)).toBeUndefined();
  });

  it('cuando ya volvió a casa, tampoco', async () => {
    // Un reencuentro es `activo: false` + `reunida_en` (ver `isReunited`).
    mockPet = { ...PET_BASE, activo: false, reunida_en: '2026-07-30T10:00:00Z' };
    const arbol = await montar();
    expect(boton(arbol, /organizar la búsqueda/i)).toBeUndefined();
  });

  it('no promete avisos ni gamifica desde la ficha', async () => {
    const t = todoElTexto(await montar()).toLowerCase();
    expect(t).not.toMatch(/te avisamos|te notificamos/);
    expect(t).not.toMatch(/puntaje|ranking|insignia/);
  });
});
