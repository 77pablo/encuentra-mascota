import React from 'react';
import { act, create } from 'react-test-renderer';
import ExplorarScreen from '../../src/screens/ExplorarScreen';
import ReportesLista from '../../src/components/ReportesLista';
import { Chip } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';
import { COLORES, COLOR_ETIQUETA, TAMANO_ETIQUETA } from '../../src/lib/senasMascota';

// FILTRAR POR COLOR Y TAMAÑO EN EXPLORAR (migración 0054).
//
// Lo que se mira acá es el resultado que importa: con qué `filtros` termina la
// lista, que es exactamente lo que se le pide a la base. Y sobre todo, que los
// filtros nuevos NO se manden cuando nadie los eligió — de eso depende que
// Explorar siga andando contra una base sin la 0054 (ver services/busqueda.ts).

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('../../src/components/ReportesMapa', () => ({
  __esModule: true,
  default: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({ coords: null, status: 'idle', request: jest.fn() }),
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
  useAuth: () => ({ user: { id: 'yo' }, session: {}, loading: false }),
}));
jest.mock('../../src/hooks/useUnread', () => ({
  useUnread: () => ({ count: 0, refresh: jest.fn() }),
}));
jest.mock('../../src/services/comunasSeguidas', () => ({
  getComunasSeguidas: () => Promise.resolve([]),
  seguirComuna: () => Promise.resolve(),
  dejarDeSeguirComuna: () => Promise.resolve(),
}));
jest.mock('../../src/services/busquedasGuardadas', () => ({
  listBusquedas: () => Promise.resolve([]),
  guardarBusqueda: () => Promise.resolve(),
  borrarBusqueda: () => Promise.resolve(),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

const montados: any[] = [];

async function montar(params?: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ExplorarScreen
          navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }}
          route={{ params }}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  montados.push(arbol);
  return arbol;
}

function filtrosDeLaLista(arbol: any): any {
  return arbol.root.findByType(ReportesLista).props.filtros;
}

function chipsCon(arbol: any, label: string): any[] {
  return arbol.root.findAllByType(Chip).filter((c: any) => c.props.label === label);
}

async function tocar(arbol: any, label: string) {
  const chips = chipsCon(arbol, label);
  expect(chips.length).toBeGreaterThan(0);
  await act(async () => {
    chips[0].props.onPress();
  });
  await act(async () => {});
}

/** Abre el panel de filtros, que arranca plegado. */
async function abrirFiltros(arbol: any) {
  const boton = arbol.root
    .findAllByType(Chip)
    .find((c: any) => String(c.props.label).startsWith('⚙ Filtros'));
  await act(async () => {
    boton.props.onPress();
  });
  await act(async () => {});
}

afterEach(async () => {
  await act(async () => {
    while (montados.length) montados.pop().unmount();
  });
});

describe('los filtros de seña', () => {
  it('sin elegir nada, no se le manda ni color ni tamaño a la búsqueda', async () => {
    // ES EL TEST QUE SOSTIENE LA REGLA. `buscarReportes` solo agrega
    // p_color/p_tamano a la llamada si acá viene algo; contra una base sin la
    // 0054 mandarlos deja a PostgREST sin firma que calce y Explorar queda en
    // blanco para TODO el mundo, filtre o no filtre la persona.
    const arbol = await montar();
    const f = filtrosDeLaLista(arbol);
    expect(f.color ?? null).toBeNull();
    expect(f.tamano ?? null).toBeNull();
  });

  it('elegir un color llega a la búsqueda con el valor de la base, no la etiqueta', async () => {
    // El chip dice "Café" y la columna guarda 'cafe'. Mandar la etiqueta no
    // devolvería nada y nadie entendería por qué.
    const arbol = await montar();
    await abrirFiltros(arbol);
    await tocar(arbol, COLOR_ETIQUETA.cafe);
    expect(filtrosDeLaLista(arbol).color).toBe('cafe');
  });

  it('elegir un tamaño llega a la búsqueda', async () => {
    const arbol = await montar();
    await abrirFiltros(arbol);
    await tocar(arbol, TAMANO_ETIQUETA.grande);
    expect(filtrosDeLaLista(arbol).tamano).toBe('grande');
  });

  it('volver a tocarlo lo suelta', async () => {
    const arbol = await montar();
    await abrirFiltros(arbol);
    await tocar(arbol, COLOR_ETIQUETA.negro);
    expect(filtrosDeLaLista(arbol).color).toBe('negro');
    await tocar(arbol, COLOR_ETIQUETA.negro);
    expect(filtrosDeLaLista(arbol).color ?? null).toBeNull();
  });

  it('cuentan en el contador del botón Filtros', async () => {
    // Si no contaran, se podría dejar un filtro puesto con el panel cerrado y
    // no habría forma de darse cuenta de por qué la lista está casi vacía.
    const arbol = await montar();
    await abrirFiltros(arbol);
    await tocar(arbol, COLOR_ETIQUETA.negro);
    await tocar(arbol, TAMANO_ETIQUETA.chico);
    const boton = arbol.root
      .findAllByType(Chip)
      .find((c: any) => String(c.props.label).startsWith('⚙ Filtros'));
    expect(String(boton.props.label)).toContain('(2)');
  });

  it('viven DENTRO del panel plegado, no sueltos en la pantalla', async () => {
    // "No llenes la pantalla de chips": diez chips más siempre visibles
    // taparían la lista, que es lo que la persona vino a mirar.
    const cerrado = await montar();
    expect(chipsCon(cerrado, COLOR_ETIQUETA.negro)).toHaveLength(0);
    await abrirFiltros(cerrado);
    expect(chipsCon(cerrado, COLOR_ETIQUETA.negro)).toHaveLength(1);
  });

  it('el vocabulario es el MISMO que el del formulario de publicar', async () => {
    // Si Explorar ofreciera colores que Publicar no puede guardar, el filtro no
    // encontraría nunca nada y no habría error en ninguna parte.
    const arbol = await montar();
    await abrirFiltros(arbol);
    for (const c of COLORES) {
      expect({ color: c, chips: chipsCon(arbol, COLOR_ETIQUETA[c]).length }).toEqual({
        color: c,
        chips: 1,
      });
    }
  });
});
