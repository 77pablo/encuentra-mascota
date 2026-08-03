import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import PublicPetScreen from '../../src/screens/PublicPetScreen';
import { Button, Input } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// "LO VI ACÁ" SIN CUENTA, EN LA PANTALLA PÚBLICA DEL REPORTE.
//
// `MascotaPublica` es lo que abre el QR de un afiche y todo link compartido por
// WhatsApp. Quien llega ahí con el animal al lado es un desconocido que no tiene
// la app y no se va a registrar: es el eslabón más caro de la cadena, porque es
// la persona que TIENE al animal.
//
// Lo que este archivo protege:
//   · el botón existe SIN sesión (si pidiera login, no lo usa nadie);
//   · no aparece donde no corresponde (mi propio reporte, un "encontrada");
//   · y sobre todo: si el aviso NO salió, la pantalla no dice que salió. Que se
//     vaya a su casa creyendo que la familia ya sabe es el peor final posible.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: (_props: any) => null,
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../../src/lib/share', () => ({ shareReport: jest.fn() }));

const mockGetPet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  getPet: (...args: any[]) => mockGetPet(...args),
}));

const mockAvisar = jest.fn();
const mockAvisarConFoto = jest.fn();
jest.mock('../../src/services/avisoAnonimo', () => ({
  avisarSinCuenta: (...args: any[]) => mockAvisar(...args),
  avisarConFoto: (...args: any[]) => mockAvisarConFoto(...args),
  TOPE_NOTA: 500,
}));

// D5: la foto (opcional) sube por `pickImage` (el mismo picker del Perfil) y
// se comprime con `expo-image-manipulator` calcado de `services/storage.ts`.
// Ninguno de los dos hace falta probarlo DE VERDAD acá: ya tienen su propio
// código (o son de la librería), y lo que importa para esta pantalla es que
// con una foto elegida, avisar() llame a `avisarConFoto` en vez de
// `avisarSinCuenta` — no cómo se comprime ni se lee el archivo.
const mockTakePhoto = jest.fn();
const mockPickFromLibrary = jest.fn();
jest.mock('../../src/lib/pickImage', () => ({
  takePhoto: (...args: any[]) => mockTakePhoto(...args),
  pickFromLibrary: (...args: any[]) => mockPickFromLibrary(...args),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'comprimida://foto.jpg' })),
  SaveFormat: { JPEG: 'jpeg' },
}));

// Se lee dentro del hook falso, así que cambiarlo entre tests alcanza.
let mockUsuario: { id: string } | null = null;
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUsuario, session: null, loading: false }),
}));

const PET = {
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
  recompensa: null,
  creado_en: '2026-07-20T10:00:00Z',
  renovado_en: null,
  activo: true,
  oculto: false,
  reunida_en: null,
};

const navigation = { navigate: jest.fn(), replace: jest.fn() };

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

function botonLoVi(tree: any) {
  return tree.root.findAllByType(Button).find((b: any) => /lo vi acá/i.test(b.props.title));
}

function botonPorTitulo(tree: any, re: RegExp) {
  return tree.root.findAllByType(Button).find((b: any) => re.test(b.props.title));
}

async function montar() {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <PublicPetScreen route={{ params: { id: 'pet-1' } }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

// `uriABase64` (helper local de la pantalla) usa fetch→blob→FileReader. El
// entorno de jest (jest-expo) ya trae `fetch` y `Blob`, pero NO `FileReader`
// — se simula acá, igual que haría el navegador, para poder probar el camino
// completo sin tocar red de verdad.
const FETCH_ORIGINAL = global.fetch;
class FileReaderFalso {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  readAsDataURL(_blob: unknown) {
    this.result = 'data:image/jpeg;base64,QUJD';
    Promise.resolve().then(() => this.onloadend?.());
  }
}

beforeEach(() => {
  mockGetPet.mockReset();
  mockGetPet.mockResolvedValue(PET);
  mockAvisar.mockReset();
  mockAvisar.mockResolvedValue(undefined);
  mockAvisarConFoto.mockReset();
  mockAvisarConFoto.mockResolvedValue(undefined);
  mockTakePhoto.mockReset();
  mockPickFromLibrary.mockReset();
  mockPickFromLibrary.mockResolvedValue(['galeria://foto.jpg']);
  navigation.navigate.mockReset();
  navigation.replace.mockReset();
  mockUsuario = null;
  (global as any).fetch = jest.fn(() => Promise.resolve({ blob: () => Promise.resolve('blob-fake') }));
  (global as any).FileReader = FileReaderFalso;
});

afterAll(() => {
  (global as any).fetch = FETCH_ORIGINAL;
});

describe('MascotaPublica — avisar sin cuenta', () => {
  it('el botón está ahí SIN sesión, sin pedir registro', async () => {
    const tree = await montar();

    expect(botonLoVi(tree)).toBeTruthy();
    // Y lo dice: quien está en la vereda no tiene que adivinar si le van a
    // pedir una cuenta a mitad de camino.
    expect(textoDe(tree.root)).toContain('No hace falta cuenta');

    await act(async () => tree.unmount());
  }, 30000);

  it('avisa con la nota escrita y recién ahí agradece', async () => {
    const tree = await montar();

    const input = tree.root.findAllByType(Input)[0];
    await act(async () => {
      input.props.onChangeText('está en la plaza, tranquila');
    });

    await act(async () => {
      botonLoVi(tree).props.onPress();
    });

    expect(mockAvisar).toHaveBeenCalledTimes(1);
    const [petId, datos] = mockAvisar.mock.calls[0];
    expect(petId).toBe('pet-1');
    expect(datos.nota).toBe('está en la plaza, tranquila');
    // Sin haber tocado "sumar mi ubicación" no se manda ningún punto.
    expect(datos.lat ?? null).toBeNull();
    expect(datos.lng ?? null).toBeNull();

    // Ya avisó: agradecemos y sacamos el botón (no hay nada que volver a tocar).
    expect(textoDe(tree.root)).toContain('mandamos tu aviso');
    expect(botonLoVi(tree)).toBeUndefined();

    await act(async () => tree.unmount());
  }, 30000);

  it('no afirma que la familia SE ENTERÓ: eso la pantalla no lo puede saber', async () => {
    // `avistar_sin_cuenta` es `returns void` A PROPÓSITO (si devolviera algo,
    // sería un oráculo para enumerar reportes probando uuids). O sea que el
    // cliente NO puede distinguir "encolado" de "descartado" —reporte cerrado
    // mientras la persona miraba, aviso repetido, o alguien bloqueado— ni
    // sabe si la cadena de correo/push llegó a destino.
    //
    // Lo único cierto es que mandamos el aviso, y es lo único que se dice. La
    // copia vieja ("Listo, su familia ya sabe") afirmaba conocimiento ajeno:
    // mandaba a esa persona a su casa creyendo que del otro lado ya sabían.
    const tree = await montar();
    await act(async () => {
      botonLoVi(tree).props.onPress();
    });

    const texto = textoDe(tree.root);
    // Salió bien: se dice, y se agradece.
    expect(texto).toMatch(/mandamos tu aviso/i);
    expect(texto).toContain('Gracias por parar');
    // Pero no se habla por la familia.
    expect(texto).not.toMatch(/ya sabe|ya est[áa] avisad|ya se enter|le lleg[óo]|lo recibi/i);

    await act(async () => tree.unmount());
  }, 30000);

  it('si el aviso NO salió, no dice que salió, y se puede reintentar', async () => {
    // El caso real: la migración 0050 todavía no está aplicada, o se cayó el
    // wifi. Un "listo, avisamos" acá manda a esa persona a su casa con el perro
    // y sin que nadie sepa nada.
    mockAvisar.mockRejectedValueOnce(Object.assign(new Error('Failed to fetch'), {}));
    const tree = await montar();

    await act(async () => {
      botonLoVi(tree).props.onPress();
    });

    const texto = textoDe(tree.root);
    expect(texto).not.toContain('mandamos tu aviso');
    expect(texto).toContain('Revisá tu internet');
    // El botón sigue estando: hay algo que hacer.
    expect(botonLoVi(tree)).toBeTruthy();

    // Y reintentar de verdad vuelve a llamar.
    mockAvisar.mockResolvedValueOnce(undefined);
    await act(async () => {
      botonLoVi(tree).props.onPress();
    });
    expect(mockAvisar).toHaveBeenCalledTimes(2);
    expect(textoDe(tree.root)).toContain('mandamos tu aviso');

    await act(async () => tree.unmount());
  }, 30000);

  it('no aparece en mi propio reporte', async () => {
    // Avisarme a mí mismo que vi a mi mascota no significa nada, y encima el
    // aviso le llegaría por correo al dueño: yo.
    mockUsuario = { id: 'la-dueña' };
    const tree = await montar();

    expect(botonLoVi(tree)).toBeUndefined();

    await act(async () => tree.unmount());
  }, 30000);

  it('no aparece en un reporte de mascota ENCONTRADA', async () => {
    // En un "encontrada" el animal ya está con alguien: quien publica no está
    // esperando avistamientos, está buscando a la familia.
    mockGetPet.mockResolvedValue({ ...PET, estado: 'encontrada' });
    const tree = await montar();

    expect(botonLoVi(tree)).toBeUndefined();

    await act(async () => tree.unmount());
  }, 30000);

  it('ofrece el seguimiento como opcional y con la promesa de finalidad única', async () => {
    // D3, sobre la 0055/0061: quien avisa sin cuenta puede dejar un correo para
    // enterarse si aparece. Tiene que quedar clarísimo que es opcional y que ese
    // correo no se usa para nada más (Ley 21.719, finalidad única).
    const tree = await montar();

    const texto = textoDe(tree.root);
    expect(texto).toContain('¿Querés que te avisemos si aparece?');
    expect(texto).toContain('Solo para eso');

    await act(async () => tree.unmount());
  }, 30000);

  it('el botón de contacto de siempre sigue estando', async () => {
    // Guardia de no-regresión: la tarjeta nueva se monta al lado del flujo que
    // ya existía (el QR del afiche), no encima.
    const tree = await montar();

    const contactar = tree.root
      .findAllByType(Button)
      .find((b: any) => /contactar/i.test(b.props.title));
    expect(contactar).toBeTruthy();

    await act(async () => tree.unmount());
  }, 30000);
});

// SUMAR UNA FOTO AL AVISO (D5, sobre el bucket privado de la 0062).
describe('MascotaPublica — sumar una foto al aviso (D5)', () => {
  it('el botón para sumar una foto está arriba del de enviar, y dice para quién es', async () => {
    const tree = await montar();

    expect(botonPorTitulo(tree, /sumar una foto/i)).toBeTruthy();
    expect(textoDe(tree.root)).toContain('La foto la ve solo la familia. No se publica en ningún lado.');

    await act(async () => tree.unmount());
  }, 30000);

  it('tocarlo despliega Tomar foto / Galería, sin haber tocado nada todavía', async () => {
    const tree = await montar();

    await act(async () => {
      botonPorTitulo(tree, /sumar una foto/i).props.onPress();
    });

    expect(botonPorTitulo(tree, /^tomar foto$/i)).toBeTruthy();
    expect(botonPorTitulo(tree, /^galería$/i)).toBeTruthy();
    expect(mockTakePhoto).not.toHaveBeenCalled();
    expect(mockPickFromLibrary).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  }, 30000);

  it('elegir de la galería muestra la miniatura y un botón para quitarla', async () => {
    const tree = await montar();
    await act(async () => {
      botonPorTitulo(tree, /sumar una foto/i).props.onPress();
    });
    await act(async () => {
      botonPorTitulo(tree, /^galería$/i).props.onPress();
    });

    const quitar = tree.root.findAll(
      (n: any) => n.props?.accessibilityLabel === 'Quitar foto' && typeof n.props?.onPress === 'function',
    );
    expect(quitar.length).toBeGreaterThan(0);
    // Ya hay una foto elegida: no se vuelven a ofrecer los botones de elegir.
    expect(botonPorTitulo(tree, /^tomar foto$/i)).toBeUndefined();

    await act(async () => tree.unmount());
  }, 30000);

  it('quitar la foto vuelve al botón inicial', async () => {
    const tree = await montar();
    await act(async () => {
      botonPorTitulo(tree, /sumar una foto/i).props.onPress();
    });
    await act(async () => {
      botonPorTitulo(tree, /^galería$/i).props.onPress();
    });

    const quitar = tree.root.find(
      (n: any) => n.props?.accessibilityLabel === 'Quitar foto' && typeof n.props?.onPress === 'function',
    );
    await act(async () => {
      quitar.props.onPress();
    });

    expect(botonPorTitulo(tree, /sumar una foto/i)).toBeTruthy();

    await act(async () => tree.unmount());
  }, 30000);

  it('con una foto elegida, avisar() llama a avisarConFoto y NO a avisarSinCuenta', async () => {
    const tree = await montar();
    await act(async () => {
      botonPorTitulo(tree, /sumar una foto/i).props.onPress();
    });
    await act(async () => {
      botonPorTitulo(tree, /^galería$/i).props.onPress();
    });

    const input = tree.root.findAllByType(Input)[0];
    await act(async () => {
      input.props.onChangeText('está en la plaza, con collar rojo');
    });

    await act(async () => {
      botonLoVi(tree).props.onPress();
    });

    expect(mockAvisarConFoto).toHaveBeenCalledTimes(1);
    expect(mockAvisar).not.toHaveBeenCalled();
    const [petId, datos] = mockAvisarConFoto.mock.calls[0];
    expect(petId).toBe('pet-1');
    expect(datos.nota).toBe('está en la plaza, con collar rojo');
    expect(datos.contentType).toBe('image/jpeg');
    expect(typeof datos.fotoBase64).toBe('string');
    expect(datos.fotoBase64.length).toBeGreaterThan(0);

    // Y agradece igual que sin foto: ni una palabra de más sobre si la foto
    // llegó a subirse (D4/D5/F2: la Edge Function ya ni siquiera manda esa
    // señal en el body — las tres respuestas 200 son `{ ok: true }`).
    expect(textoDe(tree.root)).toContain('mandamos tu aviso');

    await act(async () => tree.unmount());
  }, 30000);

  it('sin foto, el camino existente sigue intacto: avisarSinCuenta y no avisarConFoto', async () => {
    const tree = await montar();

    await act(async () => {
      botonLoVi(tree).props.onPress();
    });

    expect(mockAvisar).toHaveBeenCalledTimes(1);
    expect(mockAvisarConFoto).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  }, 30000);
});
