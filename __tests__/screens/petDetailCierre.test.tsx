import React from 'react';
import { act, create } from 'react-test-renderer';
import PetDetailScreen from '../../src/screens/PetDetailScreen';
import { Button } from '../../src/ui';
import { ConsejoRadio } from '../../src/components/ConsejoRadio';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA PREGUNTA "¿APARECIÓ?" MONTADA EN LA FICHA DEL REPORTE.
//
// Dos escenarios que tienen que convivir:
//
//  1. LA MIGRACIÓN 0049 SIN APLICAR. El dueño del proyecto sube la web cuando
//     quiere y corre el SQL cuando puede. Mientras tanto la fila de `pets` NO
//     trae la clave `preguntado_en` y la tarjeta no puede aparecer: sus tres
//     botones llamarían a una RPC inexistente. La ficha, que es la pantalla más
//     importante del producto, tiene que verse EXACTAMENTE igual que ayer.
//
//  2. CON LA 0049 APLICADA. La tarjeta aparece solo en el reporte PROPIO, y
//     responder tiene que dejar la pantalla en el estado correcto sin volver a
//     consultar la base — incluido el reencuentro, que es el dato que esta
//     función existe para producir.

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

const mockResponderEstado = jest.fn();
jest.mock('../../src/services/cierreCasos', () => ({
  responderEstado: (...a: any[]) => mockResponderEstado(...a),
}));

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
jest.mock('../../src/services/profile', () => ({
  getMyProfile: jest.fn(() => Promise.resolve(null)),
  getNombrePublico: jest.fn(() => Promise.resolve('Ana')),
  // [0057] La ficha pasó a leer al autor con `getAutorPublico`, que trae el
  // nombre Y la institución verificada en una sola consulta. Sin esta clave
  // el mock devuelve undefined y la pantalla revienta al montarse.
  getAutorPublico: jest.fn(() => Promise.resolve({ nombre: 'Ana', institucion: null })),
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
const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: jest.fn(() => Promise.resolve(true)),
}));

const DIA = 24 * 60 * 60 * 1000;
const haceDias = (n: number) => new Date(Date.now() - n * DIA).toISOString();

// SIN la clave `preguntado_en`: así llega la fila cuando la 0049 no está.
const PET_SIN_MIGRACION = {
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
  creado_en: haceDias(8),
  renovado_en: haceDias(8),
  activo: true,
  oculto: false,
  reunida_en: null,
};

// CON la 0049 aplicada: la clave existe aunque valga null.
const PET_CON_MIGRACION = { ...PET_SIN_MIGRACION, preguntado_en: null, cierre_motivo: null };

const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  addListener: jest.fn(() => () => {}),
};

// Todo el texto visible, con cada nodo de texto ARMADO ENTERO. Un
// `JSON.stringify` del árbol no sirve: `¿Apareció {nombre}?` queda partido en
// tres hijos y ninguna búsqueda por la frase completa lo encuentra.
function todoElTexto(arbol: any): string {
  return arbol.root
    .findAll((n: any) => Array.isArray(n.children) && n.children.some((c: any) => typeof c === 'string'))
    .map((n: any) => n.children.filter((c: any) => typeof c === 'string').join(''))
    .join(' | ');
}

function boton(arbol: any, re: RegExp): any {
  return arbol.root.findAllByType(Button).find((b: any) => re.test(b.props.title));
}

// El reporte tal como lo tiene la pantalla DESPUÉS de responder.
//
// Hace falta mirarlo por acá porque `activo` no se dibuja en ninguna parte de
// la ficha: si solo se mirara el texto, un "sigo buscando" que además cerrara
// el reporte se vería exactamente igual que uno correcto. `ConsejoRadio` recibe
// el estado vivo y se monta siempre que el reporte propio no esté reunido.
function petEnPantalla(arbol: any): any {
  return arbol.root.findByType(ConsejoRadio).props.pet;
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
  mockPet = { ...PET_CON_MIGRACION };
  mockResponderEstado.mockReset().mockResolvedValue(undefined);
});

describe('la ficha con la migración 0049 SIN aplicar', () => {
  beforeEach(() => {
    mockPet = { ...PET_SIN_MIGRACION };
  });

  it('sigue mostrando TODO lo de siempre', async () => {
    const arbol = await montar();
    const t = todoElTexto(arbol);
    expect(t).toContain('Rocco');
    expect(t).toContain('Marrón, collar rojo.');
    expect(boton(arbol, /^Compartir$/)).toBeTruthy();
    expect(boton(arbol, /Volvió a casa/i)).toBeTruthy();
    expect(boton(arbol, /Crear afiche/i)).toBeTruthy();
    expect(t).not.toMatch(/Algo no salió bien|no pudimos/i);
  });

  it('la pregunta "¿apareció?" NO aparece, aunque el reporte tenga 8 días', async () => {
    const arbol = await montar();
    expect(todoElTexto(arbol)).not.toContain('¿Apareció');
    expect(boton(arbol, /Sigo buscándolo/i)).toBeUndefined();
    expect(boton(arbol, /Ya no lo busco/i)).toBeUndefined();
  });

  it('y nunca se llama a la RPC que no existe', async () => {
    await montar();
    expect(mockResponderEstado).not.toHaveBeenCalled();
  });
});

describe('la ficha con la 0049 aplicada', () => {
  it('el dueño ve la pregunta con el nombre de su perro', async () => {
    const arbol = await montar();
    expect(todoElTexto(arbol)).toContain('¿Apareció Rocco?');
    expect(boton(arbol, /^Sí, volvió a casa$/)).toBeTruthy();
    expect(boton(arbol, /^Sigo buscándolo$/)).toBeTruthy();
    expect(boton(arbol, /^Ya no lo busco$/)).toBeTruthy();
  });

  it('a otra persona NO se le pregunta por el reporte ajeno', async () => {
    mockUsuarioActual = 'un-vecino';
    const arbol = await montar();
    expect(todoElTexto(arbol)).not.toContain('¿Apareció');
  });

  it('no se le pregunta dos veces lo mismo: el viejo nudge de vigencia se calla', async () => {
    // `NudgeVigencia` (14/30 días) pregunta casi lo mismo. Con un reporte de 30
    // días las dos tarjetas aplicarían a la vez y quedarían dos preguntas
    // apiladas, con tres botones cada una, diciéndole lo mismo a alguien que
    // está buscando a su perro. Gana la nueva, que además registra el
    // reencuentro y renueva la vigencia.
    mockPet = { ...PET_CON_MIGRACION, creado_en: haceDias(30), renovado_en: haceDias(30) };
    const arbol = await montar();
    const t = todoElTexto(arbol);
    expect(t).toContain('¿Apareció Rocco?');
    expect(t).not.toContain('ya volvió a casa?');
    expect(boton(arbol, /^Sigue perdida$/)).toBeUndefined();
    expect(boton(arbol, /^Archivar por ahora$/)).toBeUndefined();
  });

  it('cuando NO toca preguntar, el nudge viejo sigue funcionando igual que antes', async () => {
    // El complemento del test de arriba: la supresión es solo mientras la
    // pregunta está en pantalla, no una desactivación permanente.
    mockPet = {
      ...PET_CON_MIGRACION,
      creado_en: haceDias(30),
      renovado_en: haceDias(30),
      preguntado_en: haceDias(0),
    };
    const arbol = await montar();
    expect(todoElTexto(arbol)).not.toContain('¿Apareció Rocco?');
    expect(boton(arbol, /^Sigue perdida$/)).toBeTruthy();
  });
});

describe('responder desde la ficha deja la pantalla como corresponde', () => {
  it('"volvió a casa" abre el panel del final feliz, no cierra de una', async () => {
    // Este test esperaba que el botón llamara a la RPC directo, y eso PERDÍA el
    // final feliz para siempre: al quedar `reunida`, la ficha conmuta a la
    // tarjeta de final feliz y el botón que abre el panel de "dejá un mensajito
    // y una foto" desaparece en el mismo render. Como ninguna pantalla vuelve a
    // poner `activo = true`, esa nota y esa foto ya no se podían cargar nunca
    // más. Encima quedaban dos botones con la misma etiqueta, uno arriba del
    // otro, haciendo cosas distintas — y el de arriba era el que perdía datos.
    const arbol = await montar();
    await act(async () => {
      await boton(arbol, /^Sí, volvió a casa$/).props.onPress();
    });
    await act(async () => {});

    // No cierra por atajo…
    expect(mockResponderEstado).not.toHaveBeenCalled();
    // …abre el panel donde se cargan el mensaje y la foto del reencuentro.
    const t = todoElTexto(arbol);
    expect(t).toContain('ya está en casa');
    expect(t).toContain('Confirmar reencuentro');
  });

  it('"sigo buscándolo" deja el reporte ABIERTO y guarda la pregunta respondida', async () => {
    const arbol = await montar();
    await act(async () => {
      await boton(arbol, /^Sigo buscándolo$/).props.onPress();
    });
    await act(async () => {});

    expect(mockResponderEstado).toHaveBeenCalledWith('pet-1', 'sigo_buscando');
    const t = todoElTexto(arbol);
    expect(t).not.toContain('¿Apareció Rocco?');
    // Sigue siendo un reporte vivo: ni final feliz ni cierre.
    expect(t).not.toContain('FINAL FELIZ');
    const enPantalla = petEnPantalla(arbol);
    expect(enPantalla.activo).toBe(true);
    expect(enPantalla.reunida_en).toBeNull();
    // Y RENUEVA: sin esto el reporte se archivaría solo a los 45 días de
    // publicado, al día siguiente de haber dicho "sigo buscándolo".
    expect(Date.parse(enPantalla.renovado_en)).toBeGreaterThan(Date.parse(haceDias(1)));
    expect(enPantalla.preguntado_en).toBeTruthy();
  });

  it('"ya no lo busco" cierra el reporte SIN inventar un reencuentro', async () => {
    // Lo que no puede pasar: que dejar de buscar cuente como final feliz. Sería
    // exactamente al revés de lo que esta función viene a medir.
    const arbol = await montar();
    await act(async () => {
      await boton(arbol, /^Ya no lo busco$/).props.onPress();
    });
    await act(async () => {});

    expect(mockResponderEstado).toHaveBeenCalledWith('pet-1', 'ya_no_busco');
    const t = todoElTexto(arbol);
    expect(t).not.toContain('FINAL FELIZ');
    expect(t).not.toContain('¿Apareció Rocco?');
    const enPantalla = petEnPantalla(arbol);
    expect(enPantalla.activo).toBe(false);
    expect(enPantalla.reunida_en).toBeNull();
    // Tampoco renueva la vigencia de un reporte que se acaba de cerrar.
    expect(enPantalla.renovado_en).toBe(PET_CON_MIGRACION.renovado_en);
  });

  it('si la RPC falla, la ficha NO se hace la que guardó', async () => {
    // Se prueba con "sigo buscándolo" y no con "volvió a casa": ese botón ya no
    // llama a la RPC, delega en el panel del final feliz (ver el test de más
    // arriba). Los otros dos siguen yendo derecho a la base.
    mockResponderEstado.mockRejectedValue({ code: 'PGRST202', message: 'no existe la función' });
    const arbol = await montar();
    await act(async () => {
      await boton(arbol, /^Sigo buscándolo$/).props.onPress();
    });
    await act(async () => {});

    const t = todoElTexto(arbol);
    expect(t).not.toContain('FINAL FELIZ');
    expect(t).toContain('No pudimos guardar tu respuesta');
    // La pregunta sigue ahí para volver a intentarlo.
    expect(t).toContain('¿Apareció Rocco?');
  });
});
