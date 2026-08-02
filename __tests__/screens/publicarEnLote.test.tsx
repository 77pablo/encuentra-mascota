import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import PublishScreen from '../../src/screens/PublishScreen';
import { Button, Chip, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// CARGA EN LOTE PARA INSTITUCIONES (migración 0057).
//
// Un refugio con 15 animales no los sube de a uno: el formulario le pide 15
// veces la misma comuna, el mismo punto del mapa y la misma confirmación. Al
// terminar de publicar se le ofrece cargar el siguiente conservando lo común.
//
// Las dos cosas que este archivo vigila:
//   1. que al animal #2 NO se le arrastre nada del #1 (sobre todo la foto: un
//      reporte con la cara de otro perro es un reporte falso);
//   2. que para una persona normal NO cambie absolutamente nada — la guía de
//      "qué hacer ahora" es lo primero que ve alguien que acaba de perder a su
//      mascota y no se toca.

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
jest.mock('../../src/components/ComunaPickerModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/components/TarjetaGenerador', () => ({ __esModule: true, default: () => null }));

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
  esRechazoDefinitivo: () => false,
  estoySuspendido: () => Promise.resolve(false),
}));
jest.mock('../../src/services/senasPrivadas', () => ({
  guardarSenasPrivadas: () => Promise.resolve(true),
}));
const mockGuardarChip = jest.fn();
jest.mock('../../src/services/petChip', () => ({
  guardarChip: (...a: any[]) => mockGuardarChip(...a),
}));

const mockGetMyProfile = jest.fn();
jest.mock('../../src/services/profile', () => ({
  getMyProfile: (...a: any[]) => mockGetMyProfile(...a),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useRequireAuth', () => ({ useRequireAuth: () => () => true }));

const mockNotify = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: (...a: any[]) => mockConfirm(...a),
}));

const REFUGIO = {
  id: 'yo',
  nombre: 'Refugio Los Andes',
  institucion: { tipo: 'refugio', nombre: 'Refugio Los Andes', comuna: 'Maipú', contacto: null },
};
const PERSONA = { id: 'yo', nombre: 'Ana', institucion: null };
// Perfil tal como llega mientras la 0057 no está aplicada: la RPC vieja no trae
// las claves, así que `institucion` ni siquiera existe.
const SIN_MIGRACION = { id: 'yo', nombre: 'Ana' };

const montados: any[] = [];
const navigate = jest.fn();

async function montar(params?: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <PublishScreen navigation={{ navigate }} route={{ params }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

// Cada nodo de texto ARMADO ENTERO, incluidos los numeros: `{fotoUris.length}/{MAX}`
// son tres hijos y uno de ellos no es string.
function textoDe(nodo: any): string {
  return (nodo.root ?? nodo)
    .findAllByType(Text)
    .map((t: any) =>
      (Array.isArray(t.props.children) ? t.props.children : [t.props.children])
        .filter((c: any) => typeof c === 'string' || typeof c === 'number')
        .join(''),
    )
    .join(' | ');
}

const inputDe = (arbol: any, placeholder: string) =>
  arbol.root.findAllByType(Input).find((i: any) => i.props.placeholder === placeholder);

// Por la ETIQUETA y no por `accessibilityRole="checkbox"`: los chips de señas
// también son casillas para el lector de pantalla, así que buscar por rol
// agarra el primer color de la lista y la confirmación queda sin marcar.
const casillaDe = (arbol: any) =>
  arbol.root
    .findAllByType(TouchableOpacity)
    .find((n: any) =>
      String(n.props.accessibilityLabel ?? '').startsWith('Confirmo que la foto es de la mascota'),
    );

/** Llena lo mínimo y toca Publicar. */
async function publicar(arbol: any, descripcion: string) {
  await act(async () => {
    inputDe(arbol, 'Señas: color, tamaño, collar…').props.onChangeText(descripcion);
  });
  await act(async () => {
    arbol.root.findAllByType(Button).find((b: any) => b.props.title === 'Galería').props.onPress();
  });
  await act(async () => {});
  await act(async () => {
    casillaDe(arbol).props.onPress();
  });
  await act(async () => {
    arbol.root.findAllByType(Button).find((b: any) => b.props.title === 'Publicar').props.onPress();
  });
  await act(async () => {});
  await act(async () => {});
  // Si el formulario rebotó (falta la comuna, el texto no pasó el filtro…),
  // estaríamos probando el bail y no el lote.
  expect(mockNotify).not.toHaveBeenCalledWith('Falta algo', expect.anything());
  expect(mockNotify).not.toHaveBeenCalledWith('No se pudo publicar', expect.anything());
}

const textoDeLosConfirm = () => mockConfirm.mock.calls.map((c) => `${c[0]} ${c[1]}`).join(' || ');

beforeEach(() => {
  jest.clearAllMocks();
  mockCreatePet.mockResolvedValue({ id: 'pet-1', estado: 'perdida', especie: 'perro', fotos: [] });
  mockGetMyProfile.mockResolvedValue(PERSONA);
  mockConfirm.mockResolvedValue(false);
});

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('a una institución se le ofrece cargar el siguiente', () => {
  beforeEach(() => mockGetMyProfile.mockResolvedValue(REFUGIO));

  it('la pantalla avisa de entrada que publica como el refugio', async () => {
    const t = textoDe((await montar()).root);
    expect(t).toContain('Refugio Los Andes');
  });

  it('al publicar, la oferta habla de cargar otro y NO de una guía', async () => {
    const arbol = await montar();
    await publicar(arbol, 'Quiltro café, muy manso, apareció en la plaza.');
    expect(mockCreatePet).toHaveBeenCalledTimes(1);
    expect(textoDeLosConfirm()).toMatch(/otro/i);
    expect(textoDeLosConfirm()).not.toMatch(/guía/i);
  });

  it('aceptar limpia lo del animal anterior y NO se va de la pantalla', async () => {
    mockConfirm.mockResolvedValue(true);
    const arbol = await montar();
    await publicar(arbol, 'Quiltro café, muy manso, apareció en la plaza.');
    // La foto es lo que no puede quedar: publicar al #2 con la cara del #1 es
    // un reporte falso.
    expect(textoDe(arbol.root)).toContain('0/4 fotos');
    expect(inputDe(arbol, 'Señas: color, tamaño, collar…').props.value).toBe('');
    expect(casillaDe(arbol).props.accessibilityState.checked).toBe(false);
    // Sigue en el formulario, listo para el siguiente.
    expect(navigate).not.toHaveBeenCalled();
    // Y NO se encadena una segunda oferta. Sin este chequeo, olvidarse de
    // cortar el flujo despues de limpiar el formulario pasaria desapercibido:
    // el refugio recibiria el "¿compartis una tarjeta?" entre animal y animal,
    // quince veces.
    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('el segundo animal se publica con la MISMA comuna y el MISMO punto', async () => {
    mockConfirm.mockResolvedValue(true);
    const arbol = await montar();
    await publicar(arbol, 'Quiltro café, muy manso, apareció en la plaza.');
    mockConfirm.mockResolvedValue(false);
    await publicar(arbol, 'Gata blanca con manchas negras, muy chiquita.');
    expect(mockCreatePet).toHaveBeenCalledTimes(2);
    const [uno, dos] = mockCreatePet.mock.calls.map((c) => c[0]);
    expect(dos.comuna).toBe(uno.comuna);
    expect(dos.lat).toBe(uno.lat);
    expect(dos.lng).toBe(uno.lng);
    expect(dos.estado).toBe(uno.estado);
    // …y con SU descripción, no la del anterior.
    expect(dos.descripcion).toContain('Gata blanca');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LO QUE ESTE ARCHIVO NO MIRABA, Y ERA LO PEOR QUE SE PODÍA ARRASTRAR.
  //
  // El test de acá arriba comparaba `descripcion`, `comuna`, `lat` y `estado`
  // entre las dos publicaciones — y las señas estructuradas estaban en ese
  // mismo objeto, sin que nadie las mirara. El fixture nunca tocaba el selector
  // ni el campo de chip, así que los dos viajaban `undefined` en las dos
  // llamadas y el assert pasaba por vacío.
  // ─────────────────────────────────────────────────────────────────────────
  it('el animal #2 NO hereda las señas ni el chip del #1', async () => {
    mockConfirm.mockResolvedValue(true);
    const arbol = await montar();

    // Animal #1: perro negro, grande, con su chip leído por el veterinario.
    await act(async () => {
      arbol.root.findAllByType(Chip).find((c: any) => c.props.label === 'Negro').props.onPress();
    });
    await act(async () => {
      arbol.root.findAllByType(Chip).find((c: any) => c.props.label === 'Grande').props.onPress();
    });
    await act(async () => {
      inputDe(arbol, 'Ej: 985112003456789').props.onChangeText('985112003456789');
    });
    await publicar(arbol, 'Quiltro negro grande, muy manso, apareció en la plaza.');

    // Animal #2: una gata blanca chiquita. El refugio NO vuelve a tocar el
    // selector ni el campo de chip: acaba de leer que "el resto se limpia", y
    // los dos están más abajo en el scroll.
    mockConfirm.mockResolvedValue(false);
    await publicar(arbol, 'Gata blanca con manchas, muy chiquita.');

    expect(mockCreatePet).toHaveBeenCalledTimes(2);
    const [uno, dos] = mockCreatePet.mock.calls.map((c) => c[0]);

    // Control: el #1 sí llevaba las señas (si no, el test pasa por vacío).
    expect(uno.colores).toEqual(['negro']);
    expect(uno.tamano).toBe('grande');

    // Heredadas, `senas_contradicen` (0054) DESCARTA la coincidencia buena:
    // la dueña de la gata publica "blanca/chica" y el par queda descartado.
    expect(dos.colores).toBeUndefined();
    expect(dos.tamano).toBeUndefined();

    // Y el chip, que vale 1000 puntos y dispara "casi seguro es tu mascota",
    // se guarda UNA sola vez: para el animal cuyo chip se leyó de verdad.
    expect(mockGuardarChip).toHaveBeenCalledTimes(1);
    expect(mockGuardarChip).toHaveBeenCalledWith('pet-1', 'yo', '985112003456789');
  });

  it('decir que no lo saca del formulario, como a cualquiera', async () => {
    mockConfirm.mockResolvedValue(false);
    const arbol = await montar();
    await publicar(arbol, 'Quiltro café, muy manso, apareció en la plaza.');
    expect(navigate).toHaveBeenCalledWith('Explorar');
  });
});

describe('para una persona NO cambia nada', () => {
  it('sigue recibiendo la guía de siempre al publicar una perdida', async () => {
    const arbol = await montar({ estado: 'perdida' });
    await publicar(arbol, 'Perro negro con collar rojo, se escapó del patio.');
    expect(textoDeLosConfirm()).toMatch(/guía/i);
    expect(textoDeLosConfirm()).not.toMatch(/cargar otro/i);
  });

  it('aceptar la guía la lleva a GuiaPerdida', async () => {
    mockConfirm.mockResolvedValue(true);
    const arbol = await montar({ estado: 'perdida' });
    await publicar(arbol, 'Perro negro con collar rojo, se escapó del patio.');
    expect(navigate).toHaveBeenCalledWith('GuiaPerdida');
  });

  it('en "encontrada" la guía es la otra', async () => {
    mockConfirm.mockResolvedValue(true);
    const arbol = await montar({ estado: 'encontrada' });
    await publicar(arbol, 'Perro negro con collar rojo, andaba solo por la vereda.');
    expect(navigate).toHaveBeenCalledWith('GuiaEncontrada');
  });

  it('no ve ningún cartel de cuenta institucional', async () => {
    const t = textoDe((await montar()).root);
    expect(t).not.toMatch(/institucional/i);
  });
});

describe('la pantalla no depende de que la 0057 esté aplicada', () => {
  it('sin la migración, el perfil no trae `institucion` y todo sigue igual', async () => {
    mockGetMyProfile.mockResolvedValue(SIN_MIGRACION);
    const arbol = await montar({ estado: 'perdida' });
    await publicar(arbol, 'Perro negro con collar rojo, se escapó del patio.');
    expect(textoDeLosConfirm()).toMatch(/guía/i);
  });

  it('si el perfil no se puede leer, se publica igual (no se traga la publicación)', async () => {
    // Un corte de red al leer el perfil no puede impedir publicar un reporte:
    // es la función central de la app y el lote es un extra.
    mockGetMyProfile.mockRejectedValue(new Error('sin red'));
    const arbol = await montar({ estado: 'perdida' });
    await publicar(arbol, 'Perro negro con collar rojo, se escapó del patio.');
    expect(mockCreatePet).toHaveBeenCalledTimes(1);
    expect(textoDeLosConfirm()).toMatch(/guía/i);
  });
});
