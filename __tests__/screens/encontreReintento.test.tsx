import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import EncontreScreen from '../../src/screens/EncontreScreen';
import { Button, Chip } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// "ENCONTRÉ UNA MASCOTA" — QUE UN FALLO NO DEJE LA PANTALLA EN BLANCO.
//
// El `catch` avisaba con un toast y vaciaba los resultados, pero nunca marcaba
// la búsqueda como terminada. Como los DOS bloques de salida (resultados y
// "no hay perdidas de este tipo") dependían de ese flag, tras un fallo no se
// renderizaba nada: ni resultados, ni vacío, ni reintento. Y como el efecto
// dependía solo de `especie`, volver a tocar la MISMA especie tampoco
// re-disparaba la búsqueda. La persona quedaba sin ninguna salida.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

const mockListLostBySpecies = jest.fn();
jest.mock('../../src/services/pets', () => ({
  listLostBySpecies: (...args: any[]) => mockListLostBySpecies(...args),
}));

jest.mock('../../src/lib/pickImage', () => ({
  pickFromLibrary: jest.fn(() => Promise.resolve([])),
  takePhoto: jest.fn(() => Promise.resolve(null)),
}));

// `PetCard` (la tarjeta de cada resultado) exige el contexto de favoritos.
// Acá no se prueba guardar, así que alcanza con un doble.
jest.mock('../../src/hooks/useFavorites', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggle: jest.fn() }),
  FavoritesProvider: ({ children }: any) => children,
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'el-vecino' }, session: {}, loading: false }),
  AuthProvider: ({ children }: any) => children,
}));

// `PetCard` usa el portero, que a su vez pide `useNavigation()`: acá no hay
// NavigationContainer y no es lo que se está probando.
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => () => true,
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: jest.fn(() => Promise.resolve(false)),
}));

const PERDIDA = {
  id: 'pet-9',
  user_id: 'otra',
  estado: 'perdida',
  especie: 'perro',
  nombre: 'Laika',
  raza: null,
  descripcion: 'Negra, mediana.',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  creado_en: '2026-07-20T10:00:00Z',
  renovado_en: null,
  activo: true,
  reunida_en: null,
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
        <EncontreScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  return tree;
}

function chip(tree: any, label: string) {
  return tree.root.findAllByType(Chip).find((c: any) => c.props.label === label);
}

function botonReintentar(tree: any) {
  return tree.root.findAllByType(Button).find((b: any) => /reintentar/i.test(b.props.title));
}

beforeEach(() => {
  mockListLostBySpecies.mockReset();
  mockNotify.mockReset();
  navigation.navigate.mockReset();
});

describe('EncontreScreen — la búsqueda falló', () => {
  it('muestra qué pasó y deja reintentar (no queda en blanco)', async () => {
    mockListLostBySpecies.mockRejectedValueOnce({ message: 'Failed to fetch' });
    const tree = await montar();

    await act(async () => {
      chip(tree, 'Perro').props.onPress();
    });

    const texto = textoDe(tree.root);
    expect(texto).toContain('No pudimos traer los reportes');
    expect(texto).toContain('Revisá tu internet');
    // No se le miente diciendo que no hay perdidas de ese tipo.
    expect(texto).not.toContain('No hay perdidas de este tipo reportadas');

    const reintentar = botonReintentar(tree);
    expect(reintentar).toBeTruthy();

    mockListLostBySpecies.mockResolvedValueOnce([PERDIDA]);
    await act(async () => {
      reintentar.props.onPress();
    });

    expect(mockListLostBySpecies).toHaveBeenCalledTimes(2);
    expect(mockListLostBySpecies).toHaveBeenLastCalledWith('perro');
    const tras = textoDe(tree.root);
    expect(tras).toContain('¿Es alguna de estas?');
    expect(tras).not.toContain('No pudimos traer los reportes');
    expect(botonReintentar(tree)).toBeUndefined();

    await act(async () => {
      tree.unmount();
    });
  }, 30000);

  it('volver a tocar la MISMA especie vuelve a buscar', async () => {
    mockListLostBySpecies.mockResolvedValue([]);
    const tree = await montar();

    await act(async () => {
      chip(tree, 'Gato').props.onPress();
    });
    expect(mockListLostBySpecies).toHaveBeenCalledTimes(1);

    await act(async () => {
      chip(tree, 'Gato').props.onPress();
    });
    expect(mockListLostBySpecies).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree.unmount();
    });
  }, 30000);
});
