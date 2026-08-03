import React from 'react';
import { act, create } from 'react-test-renderer';
import CuadrillaScreen from '../../src/screens/CuadrillaScreen';
import { ErrorAmigable } from '../../src/lib/dbErrors';
import { Button } from '../../src/ui';
import { ThemeProvider } from '../../src/theme/ThemeProvider';

// LA CUADRILLA CON DOS PERSONAS, QUE ES EL CASO REAL.
//
// Tres cosas se juegan en esta pantalla, y las tres estaban en el análisis
// previo como los motivos por los que la función puede salir MAL:
//
//  1. Si nadie aceptó la invitación todavía, una pantalla vacía se siente PEOR
//     que no tener la función. Con una sola persona el tablero tiene que
//     seguir sirviendo (es la lista de tareas del propio dueño) y no puede
//     decir "nadie se sumó" ni contar ayudantes en cero.
//  2. Nada de gamificar la búsqueda de una mascota perdida.
//  3. No prometer avisos: la cuadrilla NO manda notificaciones a nadie, porque
//     eso exigiría tocar la cola de avisos y su Edge Function, que quedan
//     fuera de alcance.
//
// Y por encima de todo: LA MIGRACIÓN 0048 PUEDE NO ESTAR APLICADA.

jest.setTimeout(60000);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (_p: any) => null,
  MaterialCommunityIcons: (_p: any) => null,
}));

const mockEstadoDeCuadrilla = jest.fn();
const mockInvitacionPorToken = jest.fn();
const mockListarTareas = jest.fn();
const mockListarMiembros = jest.fn();
const mockTomarTarea = jest.fn();
const mockCompletarTarea = jest.fn();
const mockSoltarTarea = jest.fn();
const mockAgregarTarea = jest.fn();
const mockBorrarTarea = jest.fn();
const mockCrearCuadrilla = jest.fn();
const mockSumarme = jest.fn();

jest.mock('../../src/services/cuadrilla', () => ({
  estadoDeCuadrilla: (...a: any[]) => mockEstadoDeCuadrilla(...a),
  invitacionPorToken: (...a: any[]) => mockInvitacionPorToken(...a),
  listarTareas: (...a: any[]) => mockListarTareas(...a),
  listarMiembros: (...a: any[]) => mockListarMiembros(...a),
  tomarTarea: (...a: any[]) => mockTomarTarea(...a),
  completarTarea: (...a: any[]) => mockCompletarTarea(...a),
  soltarTarea: (...a: any[]) => mockSoltarTarea(...a),
  agregarTarea: (...a: any[]) => mockAgregarTarea(...a),
  borrarTarea: (...a: any[]) => mockBorrarTarea(...a),
  crearCuadrilla: (...a: any[]) => mockCrearCuadrilla(...a),
  sumarmeALaCuadrilla: (...a: any[]) => mockSumarme(...a),
}));

const mockGetPet = jest.fn();
jest.mock('../../src/services/pets', () => ({
  getPet: (...a: any[]) => mockGetPet(...a),
}));

const mockShareInvite = jest.fn();
jest.mock('../../src/lib/share', () => ({
  shareCuadrillaInvite: (...a: any[]) => mockShareInvite(...a),
}));

// Marcador liviano: no hace falta el generador de afiches real (canvas,
// captura de imagen) para probar QUIÉN puede llegar a montarlo. Se deja algo
// reconocible en pantalla para poder comprobar que de verdad se montó.
jest.mock('../../src/components/AficheGenerator', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ pet }: any) =>
      ReactActual.createElement(Text, null, `afiche-generado-para:${pet?.id ?? ''}`),
  };
});

const mockNotify = jest.fn();
jest.mock('../../src/lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  confirmAction: jest.fn(() => Promise.resolve(true)),
}));

let mockUser: any = { id: 'dueno' };
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, session: mockUser ? {} : null, loading: false }),
}));

const mockRequireAuth = jest.fn((..._a: any[]) => true);
jest.mock('../../src/hooks/useRequireAuth', () => ({
  useRequireAuth: () => (...a: any[]) => mockRequireAuth(...a),
}));

const PET = {
  id: 'p1',
  user_id: 'dueno',
  estado: 'perdida',
  especie: 'perro',
  raza: null,
  nombre: 'Rocco',
  descripcion: 'Manchas negras',
  fotos: [],
  lat: -33.4,
  lng: -70.6,
  recompensa: null,
  activo: true,
  oculto: false,
  creado_en: '2026-08-01T00:00:00Z',
  comuna: 'Maipú',
};

const CUADRILLA = {
  id: 'c1',
  petId: 'p1',
  duenoId: 'dueno',
  token: 'tok-abc',
  creadoEn: '2026-08-01T10:00:00Z',
};

const tarea = (over: any) => ({
  id: 't1',
  cuadrillaId: 'c1',
  titulo: 'Pegar 10 carteles en las esquinas más transitadas de Maipú',
  estado: 'pendiente',
  tomadaPor: null,
  tomadaEn: null,
  creadoEn: '2026-08-01T10:00:00Z',
  ...over,
});

const navigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };

function todoElTexto(arbol: any): string {
  return JSON.stringify(arbol.toJSON());
}

function botones(arbol: any): any[] {
  return arbol.root.findAllByType(Button);
}

function boton(arbol: any, re: RegExp): any {
  return botones(arbol).find((b: any) => re.test(b.props.title));
}

async function montar(params: any) {
  let arbol: any;
  await act(async () => {
    arbol = create(
      <ThemeProvider>
        <CuadrillaScreen route={{ params }} navigation={navigation} />
      </ThemeProvider>,
    );
  });
  // Deja terminar las cargas encadenadas (estado → tareas + miembros).
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  return arbol;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'dueno' };
  mockRequireAuth.mockReturnValue(true);
  mockGetPet.mockResolvedValue(PET);
  mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'lista', cuadrilla: CUADRILLA });
  mockListarTareas.mockResolvedValue([]);
  mockListarMiembros.mockResolvedValue([
    { userId: 'dueno', nombre: 'Pablo', creadoEn: '2026-08-01T10:00:00Z' },
  ]);
});

// ───────────────────────────────────────────────────────────────────────────
// LO PRIMERO: LA MIGRACIÓN PUEDE NO ESTAR APLICADA
// ───────────────────────────────────────────────────────────────────────────
describe('con la migración 0048 SIN aplicar', () => {
  it('entrando por el link, NO dice que el link esté vencido', async () => {
    // Sería mentirle al vecino que quiso ayudar: el link está bien, lo que
    // falta es que alguien corra el SQL.
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'no-disponible' });
    const arbol = await montar({ token: 'tok-abc' });
    const t = todoElTexto(arbol);

    expect(t).not.toMatch(/venci|ya no sirve|no encontramos esta invitaci/i);
    expect(t).toMatch(/todav[íi]a no est[áa] disponible/i);
    // Y no intentó sumar a nadie a algo que no existe.
    expect(mockSumarme).not.toHaveBeenCalled();
  });

  it('entrando desde el reporte, tampoco rompe ni ofrece armarla', async () => {
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'no-disponible' });
    const arbol = await montar({ petId: 'p1' });

    expect(todoElTexto(arbol)).toMatch(/todav[íi]a no est[áa] disponible/i);
    expect(boton(arbol, /organizar|armar/i)).toBeUndefined();
    expect(mockCrearCuadrilla).not.toHaveBeenCalled();
  });

  it('un corte de red se ve como un error CON reintento, no como "no disponible"', async () => {
    mockEstadoDeCuadrilla.mockRejectedValueOnce({ message: 'Failed to fetch' });
    const arbol = await montar({ petId: 'p1' });

    expect(todoElTexto(arbol)).toMatch(/internet/i);
    expect(boton(arbol, /reintentar/i)).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL DUEÑO SOLO: EL ESTADO QUE TENÍAMOS QUE DISEÑAR CON CUIDADO
// ───────────────────────────────────────────────────────────────────────────
describe('cuadrilla de UNA sola persona (nadie aceptó todavía)', () => {
  beforeEach(() => {
    mockListarTareas.mockResolvedValue([
      tarea({ id: 't1' }),
      tarea({ id: 't2', titulo: 'Pasar por las veterinarias de Maipú' }),
    ]);
  });

  it('no dice "nadie", no cuenta ayudantes en cero y no queda vacía', async () => {
    const arbol = await montar({ petId: 'p1' });
    const t = todoElTexto(arbol);

    expect(t.toLowerCase()).not.toContain('nadie');
    expect(t).not.toMatch(/0 ayudantes|sin ayudantes|1 persona buscando/i);
    // Las tareas SÍ están: el tablero le sirve al dueño aunque esté solo.
    expect(t).toContain('Pasar por las veterinarias de Maipú');
  });

  it('lo que ofrece es compartir el link, y compartirlo funciona de verdad', async () => {
    const arbol = await montar({ petId: 'p1' });
    const invitar = boton(arbol, /invitar|compartir/i);
    expect(invitar).toBeTruthy();

    await act(async () => {
      invitar.props.onPress();
    });
    // Con el reporte y el TOKEN de la cuadrilla, que es lo que habilita a
    // sumarse. Sin el token el link no sirve para nada.
    expect(mockShareInvite).toHaveBeenCalledWith(PET, 'tok-abc');
  });

  it('el dueño puede tomar una tarea él mismo', async () => {
    const arbol = await montar({ petId: 'p1' });
    const tomar = boton(arbol, /la tomo/i);
    expect(tomar).toBeTruthy();

    mockTomarTarea.mockResolvedValue(tarea({ id: 't1', estado: 'tomada', tomadaPor: 'dueno' }));
    await act(async () => {
      tomar.props.onPress();
    });
    expect(mockTomarTarea).toHaveBeenCalledWith('t1', 'dueno');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DOS PERSONAS
// ───────────────────────────────────────────────────────────────────────────
describe('cuadrilla de DOS personas', () => {
  beforeEach(() => {
    mockListarMiembros.mockResolvedValue([
      { userId: 'dueno', nombre: 'Pablo', creadoEn: '2026-08-01T10:00:00Z' },
      { userId: 'ana', nombre: 'Ana', creadoEn: '2026-08-01T11:00:00Z' },
    ]);
    mockListarTareas.mockResolvedValue([
      tarea({ id: 't1' }),
      tarea({ id: 't2', titulo: 'Recorrer 6 cuadras', estado: 'tomada', tomadaPor: 'ana' }),
      tarea({ id: 't3', titulo: 'Avisar en la vet', estado: 'hecha', tomadaPor: 'dueno' }),
    ]);
  });

  it('cuenta las dos personas y lo que falta', async () => {
    const arbol = await montar({ petId: 'p1' });
    const t = todoElTexto(arbol);
    expect(t).toContain('2 personas buscando');
    expect(t).toContain('1 tarea sin tomar');
  });

  it('se sabe quién tiene cada tarea, por nombre y sin uuids', async () => {
    // Es la razón de ser de la función: que dos personas no recorran la misma
    // cuadra. Sin saber quién tiene qué, esto es una lista de deseos.
    const arbol = await montar({ petId: 'p1' });
    const t = todoElTexto(arbol);
    expect(t).toContain('La tomó Ana');
    expect(t).not.toContain('ana"'); // el uuid no se filtra a la pantalla
  });

  it('NO ofrece tomar una tarea que ya tiene dueño', async () => {
    const arbol = await montar({ petId: 'p1' });
    // Un solo "La tomo": el de la tarea libre. El de la tarea de Ana no existe.
    expect(botones(arbol).filter((b: any) => /la tomo/i.test(b.props.title))).toHaveLength(1);
  });

  it('si se la ganaron de mano, lo dice y recarga el tablero', async () => {
    const arbol = await montar({ petId: 'p1' });
    // Exactamente lo que tira el servicio cuando el update condicional no
    // alcanza ninguna fila (ver `tomarTarea` en services/cuadrilla.ts).
    mockTomarTarea.mockRejectedValue(
      new ErrorAmigable('Se te adelantaron: alguien más ya tomó esta tarea.'),
    );
    const llamadasPrevias = mockListarTareas.mock.calls.length;

    await act(async () => {
      boton(arbol, /la tomo/i).props.onPress();
    });

    expect(mockNotify).toHaveBeenCalled();
    expect(String(mockNotify.mock.calls.at(-1))).toMatch(/adelant/i);
    // Y se vuelve a leer: el tablero mostraba algo que ya no es verdad.
    expect(mockListarTareas.mock.calls.length).toBeGreaterThan(llamadasPrevias);
  });

  it('las tareas hechas se ven, pero no se pueden volver a tomar', async () => {
    const arbol = await montar({ petId: 'p1' });
    expect(todoElTexto(arbol)).toContain('Avisar en la vet');
    // "La tomo" solo aparece en la libre (verificado arriba); acá se comprueba
    // que la hecha tampoco ofrezca cerrarse otra vez.
    expect(botones(arbol).filter((b: any) => /ya est[áa]|hecha/i.test(b.props.title))).toHaveLength(
      0,
    );
  });

  it('Ana, que NO es la dueña, también puede generar el afiche', async () => {
    // Regresión real (revisión de la tanda 14, A4): un gate de propiedad tipo
    // `esMio && <AficheGenerator ...` volvería a dejar el afiche inalcanzable
    // para quien tomó "pegar carteles" pero no es el dueño del reporte. Un
    // test que sólo mirara el CÓDIGO FUENTE ("no debe decir esMio && <Afiche")
    // se esquiva con cualquier reformateo (otro nombre de variable, otro
    // orden de la condición) sin arreglar nada; éste verifica el
    // COMPORTAMIENTO: que el componente de verdad se monte para alguien que
    // no es el dueño.
    mockUser = { id: 'ana' };
    const arbol = await montar({ petId: 'p1' });

    const b = boton(arbol, /crear el afiche/i);
    expect(b).toBeTruthy();
    await act(async () => {
      b.props.onPress();
    });

    expect(todoElTexto(arbol)).toContain('afiche-generado-para:p1');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EL LINK DE INVITACIÓN
// ───────────────────────────────────────────────────────────────────────────
describe('abrir el link de invitación', () => {
  const INVITACION = {
    petId: 'p1',
    mascota: 'Rocco',
    especie: 'perro',
    foto: null,
    comuna: 'Maipú',
    reporteActivo: true,
    ayudantes: 1,
    tareasPendientes: 4,
    yaEstoy: false,
  };

  it('sin cuenta se ve DE QUÉ SE TRATA antes de pedir registrarse', async () => {
    // Que el link sea una pared de login es la forma más rápida de que nadie se
    // sume. La vista previa es anónima a propósito (grant a anon en la 0048).
    mockUser = null;
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'ok', invitacion: INVITACION });
    const arbol = await montar({ token: 'tok-abc' });
    const t = todoElTexto(arbol);

    expect(t).toContain('Rocco');
    expect(t).toContain('Maipú');
    expect(t).toContain('4 tareas sin tomar');
    expect(boton(arbol, /sumarme/i)).toBeTruthy();
  });

  it('dice con todas las letras que sumarse pide cuenta', async () => {
    // Es una decisión tomada a propósito (ver el comentario de la 0048).
    // Ocultarla hasta que la persona toque el botón es lo que hace que se vaya.
    mockUser = null;
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'ok', invitacion: INVITACION });
    const arbol = await montar({ token: 'tok-abc' });
    expect(todoElTexto(arbol)).toMatch(/cuenta/i);
  });

  it('sin sesión, tocar "Sumarme" pasa por el portero y NO llama a la base', async () => {
    mockUser = null;
    mockRequireAuth.mockReturnValue(false);
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'ok', invitacion: INVITACION });
    const arbol = await montar({ token: 'tok-abc' });

    await act(async () => {
      boton(arbol, /sumarme/i).props.onPress();
    });
    expect(mockRequireAuth).toHaveBeenCalled();
    expect(mockSumarme).not.toHaveBeenCalled();
  });

  it('con sesión, sumarse entra derecho al tablero', async () => {
    mockUser = { id: 'ana' };
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'ok', invitacion: INVITACION });
    mockSumarme.mockResolvedValue('c1');
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'lista', cuadrilla: CUADRILLA });
    mockListarTareas.mockResolvedValue([tarea({ id: 't1' })]);
    const arbol = await montar({ token: 'tok-abc' });

    await act(async () => {
      boton(arbol, /sumarme/i).props.onPress();
    });
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }

    expect(mockSumarme).toHaveBeenCalledWith('tok-abc');
    expect(todoElTexto(arbol)).toContain('Pegar 10 carteles');
  });

  it('un token gastado sí dice que el link ya no sirve', async () => {
    // Acá la RPC SÍ respondió y vino vacía: es distinto de "no está desplegada".
    mockInvitacionPorToken.mockResolvedValue({ tipo: 'no-existe' });
    const arbol = await montar({ token: 'gastado' });
    expect(todoElTexto(arbol)).toMatch(/ya no|no encontramos/i);
    expect(boton(arbol, /sumarme/i)).toBeUndefined();
  });

  it('quien ya se sumó y vuelve a abrir el link entra derecho, sin pedirle nada', async () => {
    mockUser = { id: 'ana' };
    mockInvitacionPorToken.mockResolvedValue({
      tipo: 'ok',
      invitacion: { ...INVITACION, yaEstoy: true },
    });
    mockListarTareas.mockResolvedValue([tarea({ id: 't1' })]);
    const arbol = await montar({ token: 'tok-abc' });

    expect(boton(arbol, /sumarme/i)).toBeUndefined();
    expect(todoElTexto(arbol)).toContain('Pegar 10 carteles');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ARMARLA POR PRIMERA VEZ
// ───────────────────────────────────────────────────────────────────────────
describe('armar la cuadrilla', () => {
  it('muestra ANTES qué tareas se van a crear, y son concretas', async () => {
    // Un botón que crea seis cosas sin decir cuáles es un salto al vacío.
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'sin-crear' });
    const arbol = await montar({ petId: 'p1' });
    const t = todoElTexto(arbol);

    expect(t).toContain('Maipú');
    expect(t).toContain('Rocco');
    expect(boton(arbol, /organizar|armar/i)).toBeTruthy();
  });

  it('crea la cuadrilla CON las tareas sugeridas del reporte', async () => {
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'sin-crear' });
    const arbol = await montar({ petId: 'p1' });

    mockCrearCuadrilla.mockResolvedValue('c1');
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'lista', cuadrilla: CUADRILLA });
    await act(async () => {
      boton(arbol, /organizar|armar/i).props.onPress();
    });

    const [petIdUsado, tareas] = mockCrearCuadrilla.mock.calls[0];
    expect(petIdUsado).toBe('p1');
    expect(tareas.length).toBeGreaterThanOrEqual(5);
    // No son genéricas: llevan la comuna del reporte.
    expect(tareas.filter((x: string) => x.includes('Maipú')).length).toBeGreaterThanOrEqual(3);
  });

  it('a quien NO es el dueño no le ofrece armar nada', async () => {
    mockUser = { id: 'otro' };
    mockEstadoDeCuadrilla.mockResolvedValue({ tipo: 'sin-crear' });
    const arbol = await montar({ petId: 'p1' });
    expect(boton(arbol, /organizar|armar/i)).toBeUndefined();
    expect(mockCrearCuadrilla).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// LAS DOS PROMESAS QUE NO SE PUEDEN ROMPER
// ───────────────────────────────────────────────────────────────────────────
describe('lo que la pantalla NUNCA puede decir', () => {
  const escenarios: [string, () => void][] = [
    [
      'con una sola persona',
      () => {
        mockListarTareas.mockResolvedValue([tarea({ id: 't1' })]);
      },
    ],
    [
      'con dos y tareas repartidas',
      () => {
        mockListarMiembros.mockResolvedValue([
          { userId: 'dueno', nombre: 'Pablo', creadoEn: '2026-08-01T10:00:00Z' },
          { userId: 'ana', nombre: 'Ana', creadoEn: '2026-08-01T11:00:00Z' },
        ]);
        mockListarTareas.mockResolvedValue([
          tarea({ id: 't1' }),
          tarea({ id: 't2', estado: 'tomada', tomadaPor: 'ana' }),
          tarea({ id: 't3', estado: 'hecha', tomadaPor: 'dueno' }),
        ]);
      },
    ],
  ];

  it.each(escenarios)('%s: no gamifica la búsqueda de una mascota perdida', async (_n, armar) => {
    armar();
    const t = todoElTexto(await montar({ petId: 'p1' })).toLowerCase();
    for (const veneno of ['puntaje', 'puntos', 'ranking', 'insignia', 'medalla', 'logro', 'nivel ']) {
      expect({ palabra: veneno, aparece: t.includes(veneno) }).toEqual({
        palabra: veneno,
        aparece: false,
      });
    }
    expect(t).not.toMatch(/🏆|🥇|🎉|🎊/);
  });

  it.each(escenarios)('%s: no promete avisos que la app no manda', async (_n, armar) => {
    armar();
    const t = todoElTexto(await montar({ petId: 'p1' })).toLowerCase();
    for (const promesa of ['te avisamos', 'le avisamos', 'te notificamos', 'recibirás un aviso']) {
      expect({ frase: promesa, aparece: t.includes(promesa) }).toEqual({
        frase: promesa,
        aparece: false,
      });
    }
  });
});
