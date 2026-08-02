import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PublishScreen from '../../src/screens/PublishScreen';
import { Button, Chip, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LAS SEÑAS EN EL FORMULARIO DE PUBLICAR (migración 0054).
//
// Dos cosas distintas que se prueban acá:
//
//   1. Que lo que la persona marca llegue al reporte, y que lo que NO marcó no
//      viaje inventado. Todo es opcional: quien acaba de perder a su animal no
//      está para llenar seis campos.
//   2. Que el NÚMERO DE CHIP no se cuele en el reporte. Es el punto más
//      delicado de toda la función: el chip no es una columna de `pets`, va a
//      `pet_chips` en otra llamada, y si alguna vez apareciera dentro del insert
//      de `pets` estaría a un `select('*')` de salir publicado.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

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
const mockGuardarChip = jest.fn();
jest.mock('../../src/services/petChip', () => ({
  guardarChip: (...a: any[]) => mockGuardarChip(...a),
}));
jest.mock('../../src/services/senasPrivadas', () => ({
  guardarSenasPrivadas: () => Promise.resolve(true),
  obtenerSenasPrivadas: () => Promise.resolve(null),
}));
jest.mock('../../src/services/storage', () => ({
  uploadPetPhotos: () => Promise.resolve(['https://foto/1.jpg']),
  borrarFotosSubidas: () => Promise.resolve(),
  esRechazoDefinitivo: () => false,
  estoySuspendido: () => Promise.resolve(false),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => () => true,
}));

const mockNotify = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: (...a: any[]) => mockConfirm(...a),
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

async function tocarChip(arbol: any, label: string) {
  const chips = arbol.root.findAllByType(Chip).filter((c: any) => c.props.label === label);
  expect(chips.length).toBeGreaterThan(0);
  await act(async () => {
    chips[0].props.onPress();
  });
  await act(async () => {});
}

async function escribir(arbol: any, placeholder: string, texto: string) {
  const inputs = arbol.root
    .findAllByType(Input)
    .filter((i: any) => i.props.placeholder === placeholder);
  expect(inputs).toHaveLength(1);
  await act(async () => {
    inputs[0].props.onChangeText(texto);
  });
  await act(async () => {});
}

const PERRO_LISTO = {
  estado: 'perdida',
  especie: 'perro',
  descripcion: 'Mestizo, muy asustadizo, tiene collar azul.',
};

async function publicar(arbol: any, { esperarRebote = false } = {}) {
  await act(async () => {
    arbol.root
      .findAllByType(Button)
      .find((b: any) => b.props.title === 'Galería')
      .props.onPress();
  });
  await act(async () => {});
  // Por la ETIQUETA y no por `accessibilityRole="checkbox"`: los chips de señas
  // también son casillas para el lector de pantalla, así que buscar por rol
  // agarra el primer color de la lista y la confirmación queda sin marcar.
  const casilla = arbol.root
    .findAllByType(TouchableOpacity)
    .find((n: any) =>
      String(n.props.accessibilityLabel ?? '').startsWith('Confirmo que la foto es de la mascota'),
    );
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
  if (!esperarRebote) expect(mockNotify).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockCreatePet.mockReset();
  mockCreatePet.mockResolvedValue({ id: 'pet-1', estado: 'perdida', especie: 'perro', fotos: [] });
  mockGuardarChip.mockReset();
  mockGuardarChip.mockResolvedValue(true);
  mockConfirm.mockReset();
  mockConfirm.mockResolvedValue(false);
  mockNotify.mockReset();
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('las señas viajan al reporte', () => {
  it('lo marcado llega a createPet', async () => {
    const arbol = await montar(PERRO_LISTO);
    await tocarChip(arbol, 'Negro');
    await tocarChip(arbol, 'Blanco');
    await tocarChip(arbol, 'Grande');
    await tocarChip(arbol, 'Macho');
    await publicar(arbol);
    expect(mockCreatePet.mock.calls[0][0]).toEqual(
      expect.objectContaining({ colores: ['negro', 'blanco'], tamano: 'grande', sexo: 'macho' }),
    );
  });

  it('sin marcar nada se publica igual y no se inventa ningún dato', async () => {
    // TODO es opcional. Si publicar exigiera las señas, el formulario se
    // volvería un trámite justo en el peor momento posible.
    const arbol = await montar(PERRO_LISTO);
    await publicar(arbol);
    const enviado = mockCreatePet.mock.calls[0][0];
    expect(enviado.tamano).toBeUndefined();
    expect(enviado.sexo).toBeUndefined();
    expect(enviado.esterilizado).toBeUndefined();
    expect(enviado.colores ?? []).toEqual([]);
  });

  it('volver a tocar un color lo suelta', async () => {
    const arbol = await montar(PERRO_LISTO);
    await tocarChip(arbol, 'Negro');
    await tocarChip(arbol, 'Negro');
    await publicar(arbol);
    expect(mockCreatePet.mock.calls[0][0].colores ?? []).toEqual([]);
  });

  it('no deja marcar más de tres colores', async () => {
    // Marcar los siete equivale a no contestar, y además haría que la regla de
    // contradicción del motor no descartara jamás.
    const arbol = await montar(PERRO_LISTO);
    for (const c of ['Negro', 'Blanco', 'Gris', 'Café']) await tocarChip(arbol, c);
    await publicar(arbol);
    expect(mockCreatePet.mock.calls[0][0].colores).toEqual(['negro', 'blanco', 'gris']);
  });
});

describe('el número de chip', () => {
  const PLACEHOLDER = 'Ej: 985112003456789';

  it('el schema del reporte ni siquiera lo conoce', async () => {
    // La defensa de verdad es esta, y hace falta escribirla aparte: aunque
    // alguien agregue `chip` al objeto que se le pasa a `petSchema.safeParse`,
    // zod lo DESCARTA por no estar declarado y no llega a `createPet`. O sea
    // que un test que solo mire lo que recibe `createPet` se queda verde igual
    // (comprobado mutando la pantalla). Lo que hay que impedir es que el campo
    // entre AL SCHEMA.
    const { petSchema } = require('../../src/schemas/pet');
    const parsed = petSchema.safeParse({
      estado: 'perdida',
      especie: 'perro',
      descripcion: 'x',
      lat: 0,
      lng: 0,
      chip: '985112003456789',
    });
    expect(parsed.success).toBe(true);
    expect('chip' in parsed.data).toBe(false);
  });

  it('NO viaja nunca dentro del reporte', async () => {
    // ESTE es el test que importa del archivo. Si el chip entrara en el insert
    // de `pets`, quedaría a un `select('*')` de aparecer en la ficha pública —
    // y publicar el chip destruye justo el valor que tiene (deja de servir para
    // probar de quién es el animal, porque el estafador lo lee del aviso).
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985 112 003 456 789');
    await publicar(arbol);
    const enviado = JSON.stringify(mockCreatePet.mock.calls[0][0]);
    expect(enviado).not.toContain('985112003456789');
    expect(enviado).not.toContain('chip');
  });

  it('se guarda aparte, contra el reporte recién creado', async () => {
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985112003456789');
    await publicar(arbol);
    expect(mockGuardarChip).toHaveBeenCalledWith('pet-1', 'yo', '985112003456789');
  });

  it('sin chip no se llama al servicio (no se crea una fila vacía)', async () => {
    const arbol = await montar(PERRO_LISTO);
    await publicar(arbol);
    expect(mockGuardarChip).not.toHaveBeenCalled();
  });

  it('un chip que no puede ser rebota ANTES de subir las fotos', async () => {
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '12');
    await publicar(arbol, { esperarRebote: true });
    expect(mockNotify).toHaveBeenCalled();
    expect(mockCreatePet).not.toHaveBeenCalled();
  });

  it('si guardar el chip falla, el reporte YA está publicado y no se pierde', async () => {
    // Una mascota perdida importa más que un extra. Mismo criterio que la seña
    // secreta de la 0047.
    mockGuardarChip.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985112003456789');
    await publicar(arbol);
    expect(mockCreatePet).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    (console.warn as jest.Mock).mockRestore();
  });

  // ───────────────────────────────────────────────────────────────────────
  // …PERO HAY QUE DECIRLO. Justo arriba del campo la pantalla promete "si
  // alguien publica una mascota encontrada con el mismo chip, te avisamos
  // enseguida. Es el dato que más sirve de todos". Cuando el guardado fallaba,
  // lo único que pasaba era un `console.warn`: la persona se iba creyendo que
  // tenía el cruce activo, y en Editar iba a ver el campo vacío, así que
  // tampoco se enteraba ahí.
  // ───────────────────────────────────────────────────────────────────────
  const textoDeLosConfirm = () => mockConfirm.mock.calls.map((c) => `${c[0]} ${c[1]}`).join(' || ');

  it('si el chip no se guarda, el "¡Publicado!" lo dice', async () => {
    mockGuardarChip.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985112003456789');
    await publicar(arbol);
    expect(textoDeLosConfirm()).toMatch(/chip no se pudo guardar/i);
    (console.warn as jest.Mock).mockRestore();
  });

  it('y también cuando devuelve `false` sin lanzar (la tabla no está)', async () => {
    // Este es el camino que nadie miraba: `guardarChip` devuelve false cuando
    // falta la migración 0054, sin excepción. Con la base sin migrar, TODOS
    // los chips que se tipearan se descartaban en silencio.
    mockGuardarChip.mockResolvedValue(false);
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985112003456789');
    await publicar(arbol);
    expect(textoDeLosConfirm()).toMatch(/chip no se pudo guardar/i);
  });

  it('y NO lo dice cuando sí se guardó (si no, el aviso no significa nada)', async () => {
    const arbol = await montar(PERRO_LISTO);
    await escribir(arbol, PLACEHOLDER, '985112003456789');
    await publicar(arbol);
    expect(mockGuardarChip).toHaveBeenCalled();
    expect(textoDeLosConfirm()).not.toMatch(/chip/i);
  });

  it('la pantalla dice que el chip no se publica', async () => {
    // No es adorno: sin decirlo, mucha gente no lo va a poner (y con razón), y
    // el dato más fuerte del motor se queda vacío.
    const arbol = await montar(PERRO_LISTO);
    expect(textoDe(arbol.root)).toContain('No se publica');
  });
});
