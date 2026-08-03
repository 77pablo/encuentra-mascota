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
jest.mock('../../src/services/avisoAnonimo', () => ({
  avisarSinCuenta: (...args: any[]) => mockAvisar(...args),
  TOPE_NOTA: 500,
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

beforeEach(() => {
  mockGetPet.mockReset();
  mockGetPet.mockResolvedValue(PET);
  mockAvisar.mockReset();
  mockAvisar.mockResolvedValue(undefined);
  navigation.navigate.mockReset();
  navigation.replace.mockReset();
  mockUsuario = null;
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
