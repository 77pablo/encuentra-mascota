import React from 'react';
import { act, create } from 'react-test-renderer';
import DeleteAccountScreen from '../../src/screens/DeleteAccountScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// A13 — BORRÁS TU CUENTA Y TE QUEDÁS PARADO AHÍ.
//
// El camino feliz era: `borrarMiCuenta()` → notify('Cuenta borrada') →
// `signOut()` → nada. Y `signOut` tampoco te sacaba, porque el stack raíz ya no
// bifurca por sesión (a propósito: ver RootNavigator, "el stack no se remonta").
// Así que quedabas mirando la pantalla de borrar una cuenta que ya no existe,
// con el botón rojo REHABILITADO por el `finally`: un segundo toque se iba
// contra un 401.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: () => Promise.resolve(true),
}));

const mockSignOut = jest.fn();
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-yo' }, session: {}, loading: false, signOut: () => mockSignOut() }),
}));

const mockBorrarMiCuenta = jest.fn();
jest.mock('../../src/services/account', () => ({
  borrarMiCuenta: (...args: any[]) => mockBorrarMiCuenta(...args),
}));

const navigation = { navigate: jest.fn(), popToTop: jest.fn(), goBack: jest.fn() };

function botones(arbol: any, title: string): any[] {
  return arbol.root.findAll((n: any) => typeof n.type !== 'string' && n.props?.title === title);
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <DeleteAccountScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return arbol;
}

beforeEach(() => {
  mockNotify.mockReset();
  navigation.navigate.mockReset();
  navigation.popToTop.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockBorrarMiCuenta.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {});
});

describe('después de borrar la cuenta', () => {
  it('te lleva al Inicio, como invitado', async () => {
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('App', { screen: 'Inicio' });
  });

  it('deja limpio el stack del Perfil, para no volver a esta pantalla', async () => {
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(navigation.popToTop).toHaveBeenCalled();
  });

  it('cierra la sesión', async () => {
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('el botón NO vuelve a habilitarse: un segundo toque se iba contra un 401', async () => {
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(botones(arbol, 'Borrar mi cuenta')).toHaveLength(0);
  });

  it('aunque signOut falle, igual te saca de acá (la cuenta ya no existe)', async () => {
    mockSignOut.mockRejectedValue(new Error('401'));
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('App', { screen: 'Inicio' });
  });
});

describe('si el borrado falla', () => {
  it('no te saca de la pantalla', async () => {
    mockBorrarMiCuenta.mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('el botón vuelve a estar disponible para reintentar', async () => {
    mockBorrarMiCuenta.mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Borrar mi cuenta')[0].props.onPress();
    });

    expect(botones(arbol, 'Borrar mi cuenta')).toHaveLength(1);
    expect(botones(arbol, 'Borrar mi cuenta')[0].props.disabled).toBeFalsy();
  });
});
