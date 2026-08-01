import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import CollarScreen from '../../src/screens/CollarScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// ESCANEAR EL QR DE LA PLACA CON UN CORTE DE RED.
//
// Es el flujo más urgente del producto: alguien tiene al perro en la mano y
// acaba de escanear el collar. La pantalla metía CUALQUIER fallo en el mismo
// estado y mostraba "No encontramos esta placa · puede que el código esté
// gastado o ya no exista", sin ninguna acción. Con eso, un wifi que se cae le
// dice a la persona que no hay nada que hacer, y se va.
//
// "No pudimos leerla" y "no existe" son cosas distintas y se ven distinto.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
}));

const mockMascotaPorCollar = jest.fn();
jest.mock('../../src/services/myPets', () => ({
  mascotaPorCollar: (...args: any[]) => mockMascotaPorCollar(...args),
  avisarEscaneoCollar: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

const MASCOTA = {
  nombre: 'Rocco',
  especie: 'perro',
  foto: null,
  reporte_perdida_id: null,
};

const navigation = { navigate: jest.fn() };

function textoDe(nodo: any): string {
  return nodo
    .findAllByType(Text)
    .flatMap((t: any) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c: any) => typeof c === 'string')
    .join(' ');
}

async function montar() {
  let tree: any;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <CollarScreen route={{ params: { token: 'tok-1' } }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

beforeEach(() => {
  mockMascotaPorCollar.mockReset();
  navigation.navigate.mockReset();
});

describe('CollarScreen — la placa no se pudo leer', () => {
  it('un fallo de red NO se informa como "esta placa no existe", y se puede reintentar', async () => {
    mockMascotaPorCollar.mockRejectedValueOnce({ message: 'Failed to fetch' });
    const tree = await montar();

    const texto = textoDe(tree.root);
    // Lo que NO puede decir: mandaría a la persona a su casa.
    expect(texto).not.toContain('No encontramos esta placa');
    expect(texto).not.toContain('ya no exista');
    // Lo que sí: no pudimos conectarnos, probá de nuevo.
    expect(texto).toContain('Revisá tu internet');

    // Y hay una salida de verdad.
    const reintentar = tree.root
      .findAllByType(Button)
      .find((b: any) => /reintentar/i.test(b.props.title));
    expect(reintentar).toBeTruthy();

    expect(mockMascotaPorCollar).toHaveBeenCalledTimes(1);
    mockMascotaPorCollar.mockResolvedValueOnce(MASCOTA);
    await act(async () => {
      reintentar.props.onPress();
    });

    // El reintento volvió a pedir la MISMA placa y ahora sí se ve la mascota.
    expect(mockMascotaPorCollar).toHaveBeenCalledTimes(2);
    expect(mockMascotaPorCollar).toHaveBeenLastCalledWith('tok-1');
    const tras = textoDe(tree.root);
    expect(tras).toContain('Rocco');
    expect(tras).toContain('tiene familia');
    expect(tras).not.toContain('Revisá tu internet');

    await act(async () => {
      tree.unmount();
    });
  }, 30000);

  it('una placa que de verdad no está sigue mostrando el estado vacío, sin reintento', async () => {
    // Acá la consulta SÍ respondió: la placa no existe. No hay nada que
    // reintentar y ofrecerlo sería mentirle a la persona en la otra dirección.
    mockMascotaPorCollar.mockResolvedValueOnce(null);
    const tree = await montar();

    expect(textoDe(tree.root)).toContain('No encontramos esta placa');
    const reintentar = tree.root
      .findAllByType(Button)
      .find((b: any) => /reintentar/i.test(b.props.title));
    expect(reintentar).toBeUndefined();

    await act(async () => {
      tree.unmount();
    });
  }, 30000);
});
