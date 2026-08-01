import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PublishScreen from '../../src/screens/PublishScreen';
import { SelectorAmbito } from '../../src/components/SelectorAmbito';
import { Button, Chip } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// PREGUNTAR EL ÁMBITO SOLO CUANDO APORTA, Y QUE SE PUEDA OMITIR.
//
// Según el estudio de Queensland (n=1.232), un gato de interior escapado
// aparece a una mediana de 50 m y uno con acceso a la calle a 315 m: seis veces
// más. Ese dato cambia por completo dónde conviene buscar, y es la ÚNICA
// pregunta que lo consigue. En perros el radio sale igual, así que preguntarlo
// sería un campo más en un formulario que la persona está llenando con las
// manos temblando.
//
// Y tiene que poder saltearse: quien no contesta se queda con el radio ancho.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// `react-native-maps` revienta al importarse en jest (módulo nativo).
jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: () => null,
}));
jest.mock('../../src/components/ComunaPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../src/components/TarjetaGenerador', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ status: 'denied' }),
  getCurrentPositionAsync: () => Promise.resolve({ coords: { latitude: 0, longitude: 0 } }),
}));

jest.mock('../../src/lib/pickImage', () => ({
  pickFromLibrary: () => Promise.resolve(['file://foto.jpg']),
  takePhoto: () => Promise.resolve(null),
}));

const mockCreatePet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  createPet: (...a: any[]) => mockCreatePet(...a),
}));
jest.mock('../../src/services/storage', () => ({
  uploadPetPhotos: () => Promise.resolve(['https://foto/1.jpg']),
  borrarFotosSubidas: () => Promise.resolve(),
  esRechazoDePermiso: () => false,
  estoySuspendido: () => Promise.resolve(false),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => () => true,
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: () => Promise.resolve(false),
}));

const montados: any[] = [];

async function montar(params?: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PublishScreen navigation={{ navigate: jest.fn() }} route={{ params }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

/** Los selectores de estado/especie son TouchableOpacity con su etiqueta adentro. */
async function tocarOpcion(arbol: any, etiqueta: string) {
  const nodos = arbol.root
    .findAllByType(TouchableOpacity)
    .filter((n: any) => textoDe(n).trim() === etiqueta);
  expect(nodos.length).toBeGreaterThan(0);
  await act(async () => {
    nodos[0].props.onPress();
  });
  await act(async () => {});
}

async function tocarChip(arbol: any, label: string) {
  const chips = arbol.root.findAllByType(Chip).filter((c: any) => c.props.label === label);
  expect(chips).toHaveLength(1);
  await act(async () => {
    chips[0].props.onPress();
  });
  await act(async () => {});
}

function hayPregunta(arbol: any): boolean {
  return arbol.root.findAllByType(SelectorAmbito).length > 0;
}

beforeEach(() => {
  mockCreatePet.mockReset();
  mockCreatePet.mockResolvedValue({ id: 'pet-1', estado: 'perdida', especie: 'gato', fotos: [] });
  mockNotify.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('la pregunta del ámbito aparece solo donde cambia algo', () => {
  it('no se pregunta en un perro perdido', async () => {
    const arbol = await montar({ estado: 'perdida', especie: 'perro' });
    expect(hayPregunta(arbol)).toBe(false);
  });

  it('se pregunta en un gato perdido', async () => {
    const arbol = await montar({ estado: 'perdida', especie: 'gato' });
    expect(hayPregunta(arbol)).toBe(true);
  });

  it('no se pregunta en un gato ENCONTRADO', async () => {
    // Quien lo encontró no tiene forma de saber si vivía adentro: pedírselo
    // sería pedirle que invente un dato que después calibra la búsqueda.
    const arbol = await montar({ estado: 'perdida', especie: 'gato' });
    expect(hayPregunta(arbol)).toBe(true);
    await tocarOpcion(arbol, 'Encontrada');
    expect(hayPregunta(arbol)).toBe(false);
  });

  it('aparece y desaparece al cambiar de especie sobre la marcha', async () => {
    const arbol = await montar({ estado: 'perdida', especie: 'perro' });
    expect(hayPregunta(arbol)).toBe(false);
    await tocarOpcion(arbol, 'Gato');
    expect(hayPregunta(arbol)).toBe(true);
    await tocarOpcion(arbol, 'Otro');
    expect(hayPregunta(arbol)).toBe(false);
  });
});

// Un gato perdido con todo lo que el formulario exige salvo la foto y la
// casilla, que se completan en `publicar`.
const GATO_LISTO = {
  estado: 'perdida',
  especie: 'gato',
  descripcion: 'Atigrado, collar rojo, muy asustadizo.',
};

describe('el ámbito viaja al reporte, y omitirlo también es válido', () => {
  async function publicar(arbol: any) {
    await act(async () => {
      arbol.root
        .findAllByType(Button)
        .find((b: any) => b.props.title === 'Galería')
        .props.onPress();
    });
    await act(async () => {});
    // La casilla de confirmación (accessibilityRole="checkbox").
    const casilla = arbol.root
      .findAllByType(TouchableOpacity)
      .find((n: any) => n.props.accessibilityRole === 'checkbox');
    await act(async () => {
      casilla.props.onPress();
    });
    await act(async () => {
      arbol.root
        .findAllByType(Button)
        .find((b: any) => b.props.title === 'Publicar')
        .props.onPress();
    });
    await act(async () => {});
    // Si el formulario rebotó por otra cosa (falta la comuna, el texto no pasa
    // el filtro…), el test estaría probando el bail y no el ámbito.
    expect(mockNotify).not.toHaveBeenCalled();
  }

  it('lo elegido llega a createPet', async () => {
    const arbol = await montar(GATO_LISTO);
    await tocarChip(arbol, 'No, era de adentro');
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
    expect(mockCreatePet.mock.calls[0][0]).toEqual(
      expect.objectContaining({ ambito: 'interior' }),
    );
  });

  it('sin contestar se publica igual y NO se manda un ámbito inventado', async () => {
    const arbol = await montar(GATO_LISTO);
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
    expect(mockCreatePet.mock.calls[0][0].ambito).toBeUndefined();
  });

  it('un ámbito contestado en gato no se cuela si después se cambia a perro', async () => {
    // Si no se limpia, el reporte de un perro sale con un dato que la persona
    // contestó sobre otro animal y que ya nadie ve en pantalla.
    const arbol = await montar(GATO_LISTO);
    await tocarChip(arbol, 'No, era de adentro');
    await tocarOpcion(arbol, 'Perro');
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
    expect(mockCreatePet.mock.calls[0][0].ambito).toBeUndefined();
  });
});
