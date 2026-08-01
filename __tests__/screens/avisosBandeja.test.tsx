import React from 'react';
import { act, create } from 'react-test-renderer';
import AvisosScreen from '../../src/screens/AvisosScreen';
import { useAvisosSinLeer } from '../../src/hooks/useAvisosSinLeer';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA BANDEJA DE AVISOS DENTRO DE LA APP (Tarea 3, migración 0051).
//
// Hasta ahora un aviso solo existía si salía por correo o por push. El correo
// está fallando (Brevo sin activar), así que hay avisos encolados que nadie vio
// nunca. Esta pantalla es la red de contención — y por eso lo que más se prueba
// acá no es que la lista se dibuje, sino que la pantalla NUNCA anuncie un vacío
// que no comprobó:
//
//   · Un corte de red se ve como error CON reintento (no como "no tenés avisos").
//   · La migración sin aplicar (PGRST202) también, y el resto del Perfil sigue.
//
// Es la quinta pantalla del repo donde hace falta esta distinción; ya nos
// equivocamos cuatro veces (AlertZone, MisBusquedas, Perfil, Moderación).

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  MaterialCommunityIcons: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, [cb]);
  },
}));

const mockMisAvisos = jest.fn();
jest.mock('../../src/services/avisos', () => ({
  misAvisos: (...a: any[]) => mockMisAvisos(...a),
}));

const mockMarcarLeidos = jest.fn((_hasta: string) => Promise.resolve());
const mockUltimaVisita = jest.fn(() => Promise.resolve(null as string | null));
jest.mock('../../src/lib/visitaAvisos', () => ({
  marcarAvisosLeidos: (hasta: string) => mockMarcarLeidos(hasta),
  ultimaVisitaAvisos: () => mockUltimaVisita(),
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-yo' }, session: {}, loading: false }),
}));

const AVISO_COINCIDENCIA = {
  id: 'e1',
  tipo: 'coincidencia',
  pet_id: 'pet-1',
  datos: { match_estado: 'encontrada', match_pet_id: 'pet-2' },
  creado_en: '2026-08-01T12:00:00Z',
};

const AVISO_COLLAR = {
  id: 'e2',
  tipo: 'escaneo_collar',
  pet_id: null,
  datos: { nombre_mascota: 'Pelusa', nota: 'está en la plaza' },
  creado_en: '2026-08-01T09:00:00Z',
};

function textos(arbol: any): string {
  return arbol.root
    .findAll((n: any) => typeof n.type === 'string')
    .flatMap((n: any) => n.children.filter((c: any) => typeof c === 'string'))
    .join(' | ');
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

/** Los nodos tocables de la lista (cada tarjeta de aviso). */
function tocables(arbol: any): any[] {
  return arbol.root.findAll((n: any) => typeof n.props?.onPress === 'function' && n.props?.accessibilityRole === 'button');
}

const navigation = { navigate: jest.fn() };

async function montar() {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <AvisosScreen navigation={navigation} />
      </ThemeProvider>,
    );
  });
  for (let i = 0; i < 40 && textos(arbol).includes('Cargando'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  await act(async () => {});
  return arbol;
}

let warnEspiado: jest.SpyInstance;
beforeEach(() => {
  mockMisAvisos.mockReset().mockResolvedValue([]);
  mockMarcarLeidos.mockClear();
  mockUltimaVisita.mockReset().mockResolvedValue(null);
  navigation.navigate.mockClear();
  warnEspiado = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  warnEspiado.mockRestore();
  await act(async () => {});
});

describe('cuando la lectura falla, no se anuncia un vacío', () => {
  const RED_CAIDA = { message: 'Network request failed' };

  it('NO dice que no tenés avisos', async () => {
    mockMisAvisos.mockRejectedValue(RED_CAIDA);
    const arbol = await montar();
    expect(textos(arbol)).not.toContain('Todavía no te llegó ningún aviso');
  });

  it('dice que no se pudieron leer', async () => {
    mockMisAvisos.mockRejectedValue(RED_CAIDA);
    const arbol = await montar();
    expect(textos(arbol)).toContain('No pudimos leer tus avisos');
  });

  it('aclara que los avisos no se perdieron', async () => {
    // Lo importante del texto: alguien que está buscando a su animal no puede
    // quedarse pensando que se perdió un aviso.
    mockMisAvisos.mockRejectedValue(RED_CAIDA);
    const arbol = await montar();
    expect(textos(arbol).toLowerCase()).toContain('no se perdió');
  });

  it('ofrece reintentar, y el reintento vuelve a preguntar de verdad', async () => {
    mockMisAvisos.mockRejectedValue(RED_CAIDA);
    const arbol = await montar();
    const reintentar = botones(arbol).find((b: any) => /reintentar/i.test(b.props.title));
    expect(reintentar).toBeTruthy();

    const antes = mockMisAvisos.mock.calls.length;
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA]);
    await act(async () => {
      reintentar.props.onPress();
    });
    await act(async () => {});

    expect(mockMisAvisos.mock.calls.length).toBeGreaterThan(antes);
    expect(textos(arbol)).toContain('Puede que sea la tuya');
    expect(textos(arbol)).not.toContain('No pudimos leer tus avisos');
  });

  it('el fallo queda escrito en consola (si no, no hay cómo diagnosticarlo)', async () => {
    mockMisAvisos.mockRejectedValue(RED_CAIDA);
    await montar();
    expect(warnEspiado).toHaveBeenCalled();
  });
});

describe('con la migración 0051 SIN aplicar', () => {
  const SIN_MIGRACION = { code: 'PGRST202', message: 'Could not find the function public.mis_avisos' };

  it('muestra un estado de error CON reintento, no un vacío', async () => {
    // Es el caso real del despliegue: la web sube antes de que se corra el SQL.
    // Si esto se viera como "no tenés avisos", nadie se enteraría nunca de que
    // la pantalla todavía no funciona.
    mockMisAvisos.mockRejectedValue(SIN_MIGRACION);
    const arbol = await montar();
    expect(textos(arbol)).not.toContain('Todavía no te llegó ningún aviso');
    expect(botones(arbol).some((b: any) => /reintentar/i.test(b.props.title))).toBe(true);
  });

  it('lo explica distinto de un corte de red (todavía no está disponible)', async () => {
    mockMisAvisos.mockRejectedValue(SIN_MIGRACION);
    const arbol = await montar();
    expect(textos(arbol)).toContain('todavía');
  });
});

describe('cuando la lectura funciona', () => {
  it('el vacío de verdad SÍ se anuncia', async () => {
    const arbol = await montar();
    expect(textos(arbol)).toContain('Todavía no te llegó ningún aviso');
  });

  it('muestra cada aviso con su texto', async () => {
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA, AVISO_COLLAR]);
    const arbol = await montar();
    const t = textos(arbol);
    expect(t).toContain('Puede que sea la tuya');
    expect(t).toContain('Pelusa');
    expect(t).toContain('está en la plaza');
  });

  it('NO promete que estén todos los avisos', async () => {
    // Limitación honesta: los de 'reporte_nuevo' se resuelven por zona en el
    // dispatcher y no están en esta bandeja. Prometerlos sería mentir.
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA]);
    const arbol = await montar();
    const t = textos(arbol).toLowerCase();
    expect(t).not.toContain('todos tus avisos');
    expect(t).not.toContain('todos los avisos');
  });

  it('tocar un aviso de un reporte abre ese reporte', async () => {
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA]);
    const arbol = await montar();
    const tarjetas = tocables(arbol);
    expect(tarjetas.length).toBeGreaterThan(0);
    await act(async () => {
      tarjetas[0].props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('PetDetail', { id: 'pet-1' });
  });

  it('un aviso SIN reporte (escaneo de collar) no navega a ninguna parte', async () => {
    // `pet_id` es null en los escaneos de collar (0027). Un
    // `navigate('PetDetail', { id: null })` abriría una ficha rota.
    mockMisAvisos.mockResolvedValue([AVISO_COLLAR]);
    const arbol = await montar();
    for (const tarjeta of tocables(arbol)) {
      await act(async () => {
        tarjeta.props.onPress();
      });
    }
    expect(navigation.navigate).not.toHaveBeenCalledWith('PetDetail', expect.anything());
  });

  it('marca leído hasta el aviso MÁS NUEVO, no hasta "ahora"', async () => {
    // Si marcara `now`, un aviso que llega mientras la pantalla está abierta
    // quedaría marcado como visto sin haberse mostrado nunca.
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA, AVISO_COLLAR]);
    await montar();
    expect(mockMarcarLeidos).toHaveBeenCalledWith('2026-08-01T12:00:00Z');
  });

  it('con la bandeja vacía no toca la marca de leído', async () => {
    // Sin avisos no hay nada que marcar: escribir una marca acá adelantaría el
    // corte y taparía avisos anteriores que sí estaban sin ver.
    await montar();
    expect(mockMarcarLeidos).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL BADGE: no puede tumbar el Perfil
// ───────────────────────────────────────────────────────────────────────────
function Sonda({ onValor }: { onValor: (n: number) => void }) {
  const { sinLeer } = useAvisosSinLeer();
  onValor(sinLeer);
  return null;
}

async function montarSonda() {
  const valores: number[] = [];
  await act(async () => {
    create(<Sonda onValor={(n) => valores.push(n)} />);
  });
  await act(async () => {});
  return valores;
}

describe('useAvisosSinLeer (el contador del badge)', () => {
  it('cuenta los avisos posteriores a la última visita', async () => {
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA, AVISO_COLLAR]);
    mockUltimaVisita.mockResolvedValue('2026-08-01T10:00:00Z');
    const valores = await montarSonda();
    expect(valores[valores.length - 1]).toBe(1);
  });

  it('sin ninguna visita previa, cuenta todos', async () => {
    mockMisAvisos.mockResolvedValue([AVISO_COINCIDENCIA, AVISO_COLLAR]);
    const valores = await montarSonda();
    expect(valores[valores.length - 1]).toBe(2);
  });

  it('con la migración sin aplicar devuelve 0 y NO tira', async () => {
    // El Perfil monta este hook. Si el hook propagara el error, la migración sin
    // aplicar se llevaría puesta la pantalla entera del Perfil, que es
    // exactamente lo que la restricción global prohíbe.
    mockMisAvisos.mockRejectedValue({ code: 'PGRST202', message: 'no existe' });
    const valores = await montarSonda();
    expect(valores[valores.length - 1]).toBe(0);
  });

  it('si la RPC explota de forma sincrónica tampoco tira', async () => {
    // El caso feo: `supabase.rpc` no existe (mock incompleto) y revienta antes
    // de devolver una promesa. Un `.catch()` solo no lo agarra.
    mockMisAvisos.mockImplementation(() => {
      throw new Error('boom');
    });
    const valores = await montarSonda();
    expect(valores[valores.length - 1]).toBe(0);
  });
});
