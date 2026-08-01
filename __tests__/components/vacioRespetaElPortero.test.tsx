import React from 'react';
import { act, create } from 'react-test-renderer';
import ReportesLista from '../../src/components/ReportesLista';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// El "Publicar un reporte" del estado vacío tiene que pasar por el portero de
// invitados ANTES de navegar.
//
// El portero de la pestaña Publicar es un listener de `tabPress`
// (`TabNavigator.tsx`), y `tabPress` NO se dispara en una navegación
// programática. O sea: tocando el tab de abajo el invitado se entera al toque;
// entrando por este botón entraba al formulario completo, sacaba las fotos,
// ponía el pin en el mapa, escribía la descripción, y recién al apretar
// "Publicar" le decíamos que se creara una cuenta. Todo ese trabajo tirado.
//
// `AdopcionFeedScreen:276` ya lo hacía bien (`if (!requireAuth('publicar'))
// return`); esta lista nació sin eso, y es la única llamada programática a
// 'Publicar' de todo `src/`.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

const mockRequireAuth = jest.fn();
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => (...a: any[]) => mockRequireAuth(...a),
}));

jest.mock('../../src/hooks/useBusquedaReportes', () => ({
  useBusquedaReportes: () => ({
    reportes: [],
    cargando: false,
    cargandoMas: false,
    error: null,
    hayMas: false,
    recargar: jest.fn(),
    cargarMas: jest.fn(),
  }),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
jest.mock('../../src/services/comunasSeguidas', () => ({
  getComunasSeguidas: () => Promise.resolve([]),
  seguirComuna: () => Promise.resolve(),
  dejarDeSeguirComuna: () => Promise.resolve(),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

const navigation = { navigate: (...a: any[]) => mockNavigate(...a) };

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ReportesLista filtros={{ comuna: 'Ñuñoa' }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return arbol!;
}

function botonPublicar(arbol: any) {
  return arbol.root
    .findAllByType(Button)
    .find((b: any) => /publicar/i.test(String(b.props.title ?? '')));
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockNavigate.mockReset();
});

describe('el "Publicar un reporte" del estado vacío', () => {
  it('con sesión, navega a Publicar', async () => {
    mockRequireAuth.mockReturnValue(true);
    const arbol = await montar();
    const boton = botonPublicar(arbol);
    expect(boton).toBeTruthy();

    await act(async () => boton.props.onPress());

    expect(mockRequireAuth).toHaveBeenCalledWith('publicar');
    expect(mockNavigate).toHaveBeenCalledWith('Publicar');
    await act(async () => arbol.unmount());
  });

  it('SIN sesión no navega: el portero corta antes del formulario', async () => {
    mockRequireAuth.mockReturnValue(false);
    const arbol = await montar();

    await act(async () => botonPublicar(arbol).props.onPress());

    expect(mockRequireAuth).toHaveBeenCalledWith('publicar');
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => arbol.unmount());
  });
});
