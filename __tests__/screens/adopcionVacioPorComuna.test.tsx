import React from 'react';
import { act, create } from 'react-test-renderer';
import AdopcionFeedScreen from '../../src/screens/AdopcionFeedScreen';
import ComunaPickerModal from '../../src/components/ComunaPickerModal';
import { Button, Chip, Title } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL MISMO VACÍO MENTIROSO, EN ADOPCIÓN.
//
// `hayFiltrosPuestos` también contaba la comuna y el "cerca de mí" como filtro,
// así que filtrar por tu barrio en una base casi vacía te devolvía "No
// encontramos nada así · prueba con otra especie". No probaste mal: todavía no
// hay nadie publicando ahí.
//
// Ojo con la salida que se ofrece: acá NO va "seguir la comuna". Seguir una
// comuna escribe en `notification_prefs.comunas_seguidas`, y la Edge Function
// solo la consulta para el evento `reporte_nuevo` (perdidas/encontradas). Un
// botón que dijera "te avisamos de adopciones en Ñuñoa" estaría prometiendo un
// aviso que nadie manda.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: (...a: any[]) => mockNavigate(...a) }),
}));

jest.mock('../../src/hooks/useBusquedaAdopciones', () => ({
  useBusquedaAdopciones: () => ({
    adopciones: [],
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
jest.mock('../../src/hooks/useMyLocation', () => ({
  useMyLocation: () => ({ coords: null, status: 'idle', request: jest.fn() }),
}));
jest.mock('../../src/context/AdoptionSavesProvider', () => ({
  useAdoptionSaves: () => ({ estaGuardada: () => false, alternar: jest.fn() }),
}));
jest.mock('../../src/lib/notify', () => ({
  notify: jest.fn(),
  confirmAction: () => Promise.resolve(false),
}));

function textoDe(nodo: any): string {
  const hijos = Array.isArray(nodo.props.children) ? nodo.props.children : [nodo.props.children];
  return hijos.filter((c: any) => typeof c === 'string').join('');
}

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function titulos(arbol: any): string[] {
  return arbol.root.findAllByType(Title).map(textoDe);
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <AdopcionFeedScreen navigation={{ navigate: (...a: any[]) => mockNavigate(...a) }} />
      </ThemeProvider>,
    );
  });
  await act(async () => {});
  return arbol;
}

/** Elige una comuna como lo hace la persona: por el picker de la pantalla. */
async function elegirComuna(arbol: any, comuna: string) {
  const picker = arbol.root.findByType(ComunaPickerModal);
  await act(async () => {
    picker.props.onSelect(comuna);
  });
}

async function tocarChip(arbol: any, label: string) {
  const chip = arbol.root.findAllByType(Chip).find((c: any) => c.props.label === label);
  expect(chip).toBeTruthy();
  await act(async () => {
    chip.props.onPress();
  });
}

beforeEach(() => {
  mockNavigate.mockReset();
});

afterEach(async () => {
  await act(async () => {});
});

describe('adopción · el vacío de una comuna sin publicaciones', () => {
  it('no dice que buscaste mal', async () => {
    const arbol = await montar();
    await elegirComuna(arbol, 'Ñuñoa');
    expect(textos(arbol)).not.toContain('No encontramos nada así');
  });

  it('nombra la comuna', async () => {
    const arbol = await montar();
    await elegirComuna(arbol, 'Ñuñoa');
    expect(titulos(arbol).join(' | ')).toContain('Ñuñoa');
  });

  it('ofrece publicar en adopción, y lleva a publicar', async () => {
    const arbol = await montar();
    await elegirComuna(arbol, 'Ñuñoa');
    const publicar = botones(arbol).find((b: any) => /publicar/i.test(b.props.title));
    expect(publicar).toBeTruthy();
    await act(async () => {
      publicar.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('PublicarAdopcion');
  });

  it('ofrece mirar todas las comunas, y al tocarlo el filtro se suelta', async () => {
    const arbol = await montar();
    await elegirComuna(arbol, 'Ñuñoa');
    const todas = botones(arbol).find((b: any) => /todas las comunas/i.test(b.props.title));
    expect(todas).toBeTruthy();
    await act(async () => {
      todas.props.onPress();
    });
    expect(titulos(arbol).join(' | ')).not.toContain('Ñuñoa');
  });

  it('NO ofrece seguir la comuna: ese aviso solo existe para reportes', async () => {
    const arbol = await montar();
    await elegirComuna(arbol, 'Ñuñoa');
    const seguir = botones(arbol).find((b: any) => /avisarme|siguiendo/i.test(b.props.title));
    expect(seguir).toBeUndefined();
  });
});

describe('adopción · cuando la culpa sí es del filtro', () => {
  it('elegir una especie sin resultados sigue siendo "no encontramos nada así"', async () => {
    const arbol = await montar();
    await tocarChip(arbol, 'Gato');
    expect(textos(arbol)).toContain('No encontramos nada así');
  });
});

describe('adopción · sin filtros no cambia lo que ya estaba bien', () => {
  it('sigue el texto de siempre', async () => {
    const arbol = await montar();
    expect(textos(arbol)).toContain('Todavía nadie busca hogar por acá');
  });
});
