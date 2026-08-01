import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { act, create } from 'react-test-renderer';
import PublicPetScreen from '../../src/screens/PublicPetScreen';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL BOTÓN "CONTACTAR" DE LA PANTALLA QUE ABRE EL QR DE UN AFICHE.
//
// `MascotaPublica` (esta pantalla) es el destino de TODO push de reporte
// (lib/rutaANavegacion.ts) y de TODO link compartido (RootNavigator.tsx). Es lo
// que ve el vecino que acaba de escanear el afiche con el animal en brazos.
//
// Durante meses el botón navegó a la pestaña 'Mapa', que no existe desde julio:
// tocarlo no hacía absolutamente nada.
//
// Este test NO compara contra el nombre de pestaña escrito a mano acá: aprieta
// el botón de verdad y valida el destino que sale CONTRA TabNavigator.tsx. Si
// alguien vuelve a apuntar a una pestaña que no existe, o mueve `Chat` fuera de
// ese stack, esto se pone rojo solo.

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_props: any) => null,
  MaterialCommunityIcons: (_props: any) => null,
}));

jest.mock('../../src/components/PlatformMap', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null,
  Marker: (_props: any) => null,
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
  reunida_en: null,
};

jest.mock('../../src/services/pets', () => ({
  getPet: jest.fn(() => Promise.resolve(PET)),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'el-vecino' }, session: {}, loading: false }),
}));

jest.mock('../../src/lib/share', () => ({ shareReport: jest.fn() }));

// ── Los navigators DE VERDAD, leídos del archivo ───────────────────────────
const TAB_SRC = readFileSync(
  join(__dirname, '..', '..', 'src', 'navigation', 'TabNavigator.tsx'),
  'utf8',
);

/** `<XxxNav.Screen name="…" component={Yyy} />` → { navigator, nombre, componente } */
function pantallasDe(src: string) {
  const out: { navigator: string; nombre: string; componente: string }[] = [];
  const re = /<(\w+)\.Screen\b([\s\S]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const nombre = /name="([^"]+)"/.exec(m[2])?.[1];
    const componente = /component=\{(\w+)\}/.exec(m[2])?.[1];
    if (nombre && componente) out.push({ navigator: m[1], nombre, componente });
  }
  return out;
}

const registros = pantallasDe(TAB_SRC);
const pestanas = registros.filter((r) => r.navigator === 'Tab');

/** Nombres de pantalla registrados DENTRO del stack de la pestaña `tab`. */
function pantallasDeLaPestana(tab: string): string[] {
  const componente = pestanas.find((p) => p.nombre === tab)?.componente;
  if (!componente) return [];
  // El stack de la pestaña es el navigator que renderiza ese componente:
  // `function ExplorarStack() { return (<ExplorarStackNav.Navigator> … ` .
  const cuerpo = new RegExp(`function\\s+${componente}\\s*\\(`).exec(TAB_SRC);
  if (!cuerpo) return [];
  const nav = /<(\w+)\.Navigator\b/.exec(TAB_SRC.slice(cuerpo.index))?.[1];
  return registros.filter((r) => r.navigator === nav).map((r) => r.nombre);
}

const navigation = { navigate: jest.fn(), replace: jest.fn() };

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
  navigation.navigate.mockReset();
  navigation.replace.mockReset();
});

describe('el parser lee la pestaña de verdad (chequeo de cordura)', () => {
  it('encuentra las pestañas y el contenido de sus stacks', () => {
    // Si esto dejara de funcionar, el test de abajo pasaría siempre sin cubrir
    // nada — que es exactamente como se coló el bug de 'Mapa'.
    expect(pestanas.length).toBeGreaterThanOrEqual(4);
    expect(pantallasDeLaPestana('Adopcion')).toContain('Chat');
    expect(pantallasDeLaPestana('NoExisteEstaPestana')).toEqual([]);
  });
});

describe('MascotaPublica — "Contactar" con sesión iniciada', () => {
  it('lleva a un Chat que EXISTE dentro de una pestaña que EXISTE', async () => {
    const tree = await montar();

    const boton = tree.root
      .findAllByType(Button)
      .find((b: any) => /contactar/i.test(b.props.title));
    expect(boton).toBeTruthy();

    await act(async () => {
      boton.props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    const [raiz, params] = navigation.navigate.mock.calls[0];

    // 1) Va al TabNavigator por navegación anidada absoluta (desde el stack raíz
    //    un `navigate('Chat')` pelado no llega a ninguna parte).
    expect(raiz).toBe('App');

    // 2) La pestaña que elige está registrada en TabNavigator.tsx.
    const nombresDePestanas = pestanas.map((p) => p.nombre);
    expect(nombresDePestanas).toContain(params.screen);

    // 3) Y `Chat` vive DENTRO del stack de esa pestaña.
    expect(pantallasDeLaPestana(params.screen)).toContain(params.params.screen);
    expect(params.params.screen).toBe('Chat');

    // 4) Con los datos que el chat necesita para abrir el hilo correcto.
    expect(params.params.params).toEqual({ petId: 'pet-1', otherUserId: 'la-dueña' });

    await act(async () => {
      tree.unmount();
    });
  }, 30000);
});
