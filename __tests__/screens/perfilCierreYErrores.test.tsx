import React from 'react';
import { act, create } from 'react-test-renderer';
import ProfileScreen from '../../src/screens/ProfileScreen';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// EL PERFIL: CERRAR UN REPORTE, Y NO CONFUNDIR VACÍO CON ROTO.
//
// Tres agujeros que se arreglan juntos porque viven en la misma pantalla:
//
// A2 — "Ya apareció" llamaba a `closePet`, que solo pone `activo=false`. Ese
//   reencuentro no sumaba en el contador de Inicio, no entraba en la galería
//   "Volvieron a casa" ni en `impacto_comunidad`, y no quedaba ni nota ni foto.
//   El camino bueno (`markReunited`, que escribe `reunida_en`) solo existía en
//   el detalle. Encima la lista de abajo etiquetaba "REUNIDA" a CUALQUIER
//   reporte inactivo: una etiqueta falsa.
//
// A7 — los tres fetch degradaban a `console.warn` y la persona veía el mismo
//   "No tienes reportes activos" tanto si no tenía nada como si la lectura
//   había fallado. El guardián `sinCatchMudos` exige log, no estado de UI, así
//   que la suite pasaba en verde igual. Es la cuarta vez que aparece este
//   patrón: se copia el de `AlertZoneScreen` (error distinto del vacío, con
//   reintento).
//
// B5.2 — las insignias solo se veían en el perfil AJENO.

jest.setTimeout(30000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

// El confeti anima con `useNativeDriver`, que en el renderer de jest no existe
// (`getNativeTagFromPublicInstance is not a function`) y tumba el proceso
// entero apenas se vuelve visible. No es parte de lo que se prueba acá.
jest.mock('../../src/ui/Confetti', () => ({ Confetti: () => null }));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...args: any[]) => mockNotify(...args),
  confirmAction: () => Promise.resolve(true),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-yo', email: 'yo@ejemplo.cl' }, session: {}, loading: false, signOut: jest.fn() }),
}));

const mockListMyReports = jest.fn();
const mockClosePet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  listMyReports: (...args: any[]) => mockListMyReports(...args),
  closePet: (...args: any[]) => mockClosePet(...args),
  deletePet: jest.fn(() => Promise.resolve()),
  renovarReporte: jest.fn(() => Promise.resolve()),
}));

const mockMarkReunited = jest.fn();
jest.mock('../../src/services/reunions', () => ({
  markReunited: (...args: any[]) => mockMarkReunited(...args),
}));

const mockGetMyProfile = jest.fn();
jest.mock('../../src/services/profile', () => ({
  getMyProfile: (...args: any[]) => mockGetMyProfile(...args),
  updateMyProfile: jest.fn(() => Promise.resolve()),
  camposDeContactoParaGuardar: () => ({}),
}));

const mockGetPerfilPublico = jest.fn();
jest.mock('../../src/services/perfilPublico', () => ({
  getPerfilPublico: (...args: any[]) => mockGetPerfilPublico(...args),
}));

jest.mock('../../src/services/storage', () => ({ uploadPetPhoto: jest.fn() }));
jest.mock('../../src/lib/pickImage', () => ({ pickFromLibrary: jest.fn(), takePhoto: jest.fn() }));

const ACTIVO = {
  id: 'pet-activo',
  user_id: 'u-yo',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Cholo',
  descripcion: 'Perro café con una mancha blanca',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: '2026-07-25T10:00:00Z',
  renovado_en: '2026-07-25T10:00:00Z',
};

// Cerrado CON reencuentro registrado.
const REUNIDA = {
  ...ACTIVO,
  id: 'pet-reunida',
  nombre: 'Kira',
  descripcion: 'Gata atigrada que volvió a casa',
  especie: 'gato',
  activo: false,
  reunida_en: '2026-07-28T10:00:00Z',
};

// Cerrado SIN reencuentro: el que la pantalla etiquetaba "REUNIDA" mintiendo.
const CERRADO_SIN_REENCUENTRO = {
  ...ACTIVO,
  id: 'pet-cerrado',
  nombre: 'Toby',
  descripcion: 'Reporte cerrado por otro motivo',
  activo: false,
  reunida_en: null,
};

const PERFIL = { id: 'u-yo', nombre: 'Pablo', telefono: null, red_social: null, foto_perfil: null };

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function botones(arbol: any, title: string): any[] {
  return arbol.root.findAll((n: any) => typeof n.type !== 'string' && n.props?.title === title);
}

const navigation = { navigate: jest.fn() };

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <ProfileScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  // Cuatro lecturas independientes + el ThemeProvider: se espera a que el
  // cuerpo del perfil esté en pantalla en vez de adivinar cuántos ticks van.
  for (let i = 0; i < 40 && !textos(arbol).includes('Mis reportes activos'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(textos(arbol)).toContain('Mis reportes activos');
  return arbol;
}

beforeEach(() => {
  mockNotify.mockReset();
  navigation.navigate.mockReset();
  mockClosePet.mockReset().mockResolvedValue(undefined);
  mockMarkReunited.mockReset().mockResolvedValue(undefined);
  mockGetMyProfile.mockReset().mockResolvedValue(PERFIL);
  mockGetPerfilPublico.mockReset().mockResolvedValue({
    id: 'u-yo', nombre: 'Pablo', foto_perfil: null, red_social: null,
    creado_en: '2026-01-01T00:00:00Z', reencuentros: 0, reportes: 0, aportes: 0,
  });
  mockListMyReports.mockReset().mockImplementation((_id: string, activo: boolean) =>
    Promise.resolve(activo ? [ACTIVO] : []),
  );
});

afterEach(async () => {
  await act(async () => {});
});

describe('A2 — "Ya apareció" registra el reencuentro de verdad', () => {
  it('preguntar primero: un toque no cierra nada por sí solo', async () => {
    const arbol = await montar();

    await act(async () => {
      await botones(arbol, 'Ya apareció')[0].props.onPress();
    });

    expect(mockClosePet).not.toHaveBeenCalled();
    expect(mockMarkReunited).not.toHaveBeenCalled();
    expect(textos(arbol)).toContain('¿Volvió a casa?');
  });

  it('“Sí, volvió a casa” usa markReunited (escribe reunida_en), no closePet', async () => {
    const arbol = await montar();
    await act(async () => {
      await botones(arbol, 'Ya apareció')[0].props.onPress();
    });

    await act(async () => {
      await botones(arbol, 'Sí, volvió a casa')[0].props.onPress();
    });

    expect(mockMarkReunited).toHaveBeenCalledWith('pet-activo');
    expect(mockClosePet).not.toHaveBeenCalled();
  });

  it('“La cierro por otro motivo” cierra sin inventar un reencuentro', async () => {
    const arbol = await montar();
    await act(async () => {
      await botones(arbol, 'Ya apareció')[0].props.onPress();
    });

    await act(async () => {
      await botones(arbol, 'La cierro por otro motivo')[0].props.onPress();
    });

    expect(mockClosePet).toHaveBeenCalledWith('pet-activo');
    expect(mockMarkReunited).not.toHaveBeenCalled();
  });

  it('si el guardado del reencuentro falla, se avisa y no se celebra', async () => {
    mockMarkReunited.mockRejectedValue({ code: '42501', message: 'permiso denegado' });
    const arbol = await montar();
    await act(async () => {
      await botones(arbol, 'Ya apareció')[0].props.onPress();
    });

    await act(async () => {
      await botones(arbol, 'Sí, volvió a casa')[0].props.onPress();
    });

    expect(mockNotify).toHaveBeenCalled();
    const titulos = mockNotify.mock.calls.map((c) => c[0]);
    expect(titulos).not.toContain('¡Qué alegría!');
  });
});

describe('A2 — la etiqueta "REUNIDA" deja de mentir', () => {
  it('un reporte cerrado sin reunida_en NO se muestra como reencuentro', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      Promise.resolve(activo ? [] : [CERRADO_SIN_REENCUENTRO]),
    );
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).toContain('Reporte cerrado por otro motivo');
    expect(t).not.toContain('REUNIDA');
  });

  it('un reporte con reunida_en sí se muestra como reencuentro', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      Promise.resolve(activo ? [] : [REUNIDA]),
    );
    const arbol = await montar();

    expect(textos(arbol)).toContain('REUNIDA');
  });

  it('con solo cierres comunes no se anuncian reencuentros que no hubo', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      Promise.resolve(activo ? [] : [CERRADO_SIN_REENCUENTRO]),
    );
    const arbol = await montar();

    expect(textos(arbol)).toContain('Aún no tienes reencuentros');
  });
});

describe('A7 — "no tenés nada" no se ve igual que "no pudimos leerlo"', () => {
  it('si falla la lectura de los activos, no se dice que no hay ninguno', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      activo ? Promise.reject({ message: 'se cayó la red' }) : Promise.resolve([]),
    );
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).not.toContain('No tienes reportes activos');
    expect(t).toContain('No pudimos leer tus reportes');
  });

  it('ofrece reintentar, y el reintento vuelve a pedir la lista', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      activo ? Promise.reject({ message: 'se cayó la red' }) : Promise.resolve([]),
    );
    const arbol = await montar();
    const antes = mockListMyReports.mock.calls.length;

    const btn = botones(arbol, 'Reintentar');
    expect(btn.length).toBeGreaterThan(0);
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      Promise.resolve(activo ? [ACTIVO] : []),
    );
    await act(async () => {
      await btn[0].props.onPress();
    });

    expect(mockListMyReports.mock.calls.length).toBeGreaterThan(antes);
    expect(textos(arbol)).toContain('Perro café con una mancha blanca');
  });

  it('si falla la lectura de los cerrados, no se dice que no hay reencuentros', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      activo ? Promise.resolve([ACTIVO]) : Promise.reject({ message: 'se cayó la red' }),
    );
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).not.toContain('Aún no tienes reencuentros');
    expect(t).toContain('No pudimos leer tus reencuentros');
  });

  it('las dos listas degradan por separado: una rota no tumba la otra', async () => {
    mockListMyReports.mockImplementation((_id: string, activo: boolean) =>
      activo ? Promise.resolve([ACTIVO]) : Promise.reject({ message: 'se cayó la red' }),
    );
    const arbol = await montar();

    expect(textos(arbol)).toContain('Perro café con una mancha blanca');
  });
});

describe('B5.2 — las insignias también en el perfil propio', () => {
  it('se muestran las que corresponden a mis estadísticas', async () => {
    mockGetPerfilPublico.mockResolvedValue({
      id: 'u-yo', nombre: 'Pablo', foto_perfil: null, red_social: null,
      creado_en: '2026-01-01T00:00:00Z', reencuentros: 6, aportes: 21, reportes: 3,
    });
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).toContain('Vecino de confianza');
    expect(t).toContain('Colaborador constante');
  });

  it('un perfil sin logros todavía no muestra insignias inventadas', async () => {
    const arbol = await montar();
    expect(textos(arbol)).not.toContain('Vecino de confianza');
  });
});

describe('F19 (revisión adversarial final) — el correo nunca sale sin enmascarar en la cabecera', () => {
  it('si falla la carga del perfil (profile queda null), la cabecera muestra el correo ENMASCARADO, no completo', async () => {
    mockGetMyProfile.mockReset().mockRejectedValue({ message: 'se cayó la red' });
    const arbol = await montar();

    const t = textos(arbol);
    expect(t).toContain('y***@ejemplo.cl');
    expect(t).not.toContain('yo@ejemplo.cl');
  });
});

describe('A10 — se puede llegar a "Mis comunas" desde el Perfil', () => {
  it('la fila existe y navega a la pantalla', async () => {
    const arbol = await montar();

    const btn = botones(arbol, 'Mis comunas');
    expect(btn).toHaveLength(1);
    await act(async () => {
      await btn[0].props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MisComunas');
  });
});
