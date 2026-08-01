import {
  agregarTarea,
  borrarTarea,
  completarTarea,
  crearCuadrilla,
  estadoDeCuadrilla,
  invitacionPorToken,
  listarMiembros,
  listarTareas,
  soltarTarea,
  sumarmeALaCuadrilla,
  tomarTarea,
} from '../../src/services/cuadrilla';

// CUADRILLA — acceso a las tablas de la migración 0048.
//
// Dos cosas se vigilan acá con especial insistencia:
//
//  1. LA MIGRACIÓN PUEDE NO ESTAR APLICADA. El dueño sube la web antes de
//     correr el SQL. Cuando eso pasa, PostgREST devuelve 404 + PGRST205 y estas
//     funciones tienen que decir "no disponible" — nunca romper, y nunca
//     confundirlo con un corte de red (que sí hay que poder reintentar).
//
//  2. RECHAZO SILENCIOSO DE LA RLS. Un update o un delete que la RLS rechaza NO
//     devuelve error en PostgREST: devuelve 200 y CERO filas. Sin pedir las
//     filas afectadas, la pantalla diría "listo" y no habría pasado nada. Es el
//     mismo bug que ya apareció en `borrarTip` y en la 0017.

function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

// Lo que devuelve de verdad PostgREST cuando la tabla no está en el schema
// cache. Medido contra el proyecto real el 1-ago-2026.
const SIN_MIGRACION = {
  code: 'PGRST205',
  message: "Could not find the table 'public.cuadrillas' in the schema cache",
};
const SIN_RPC = {
  code: 'PGRST202',
  message: 'Could not find the function public.crear_cuadrilla(p_pet_id) in the schema cache',
};
const RED_CAIDA = { message: 'TypeError: Failed to fetch' };

const FILA_CUADRILLA = {
  id: 'c1',
  pet_id: 'p1',
  user_id: 'dueno',
  token: 'tok-abc',
  creado_en: '2026-08-01T10:00:00Z',
};

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('estadoDeCuadrilla · la migración puede no estar aplicada', () => {
  it('con PGRST205 dice "no disponible" en vez de romper', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: SIN_MIGRACION }));
    await expect(estadoDeCuadrilla('p1')).resolves.toEqual({ tipo: 'no-disponible' });
  });

  it('un CORTE DE RED no se disfraza de "no disponible": se propaga', async () => {
    // Si se tragara, la sección desaparecería en silencio y nadie sabría que hay
    // algo que reintentar. Son dos cosas distintas y se ven distinto.
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: RED_CAIDA }));
    await expect(estadoDeCuadrilla('p1')).rejects.toMatchObject({ message: expect.any(String) });
  });

  it('sin cuadrilla todavía dice "sin-crear" (no es lo mismo que no disponible)', async () => {
    // La diferencia decide qué se ve: con "sin-crear" el dueño ve el botón de
    // armarla; con "no-disponible" no se muestra NADA.
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    await expect(estadoDeCuadrilla('p1')).resolves.toEqual({ tipo: 'sin-crear' });
  });

  it('con cuadrilla devuelve sus datos normalizados', async () => {
    const builder = makeQueryBuilder({ data: FILA_CUADRILLA, error: null });
    mockFrom.mockReturnValue(builder);
    await expect(estadoDeCuadrilla('p1')).resolves.toEqual({
      tipo: 'lista',
      cuadrilla: {
        id: 'c1',
        petId: 'p1',
        duenoId: 'dueno',
        token: 'tok-abc',
        creadoEn: '2026-08-01T10:00:00Z',
      },
    });
    expect(mockFrom).toHaveBeenCalledWith('cuadrillas');
    expect(builder.eq).toHaveBeenCalledWith('pet_id', 'p1');
  });

  it('la consulta NO toca la tabla `pets`', async () => {
    // La trampa de PostgREST: si la cuadrilla se leyera con un embed o una
    // columna nueva de `pets`, la consulta de la ficha del reporte se caería
    // ENTERA mientras la migración no esté aplicada.
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    await estadoDeCuadrilla('p1');
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalledWith('pets');
    const select = mockFrom.mock.results[0].value.select.mock.calls[0][0];
    expect(select).not.toContain('pets');
  });
});

describe('crearCuadrilla', () => {
  it('manda el reporte y las tareas sugeridas a la RPC (una sola transacción)', async () => {
    mockRpc.mockResolvedValue({ data: 'c1', error: null });
    await expect(crearCuadrilla('p1', ['Pegar carteles', 'Recorrer 6 cuadras'])).resolves.toBe('c1');
    expect(mockRpc).toHaveBeenCalledWith('crear_cuadrilla', {
      p_pet_id: 'p1',
      p_tareas: ['Pegar carteles', 'Recorrer 6 cuadras'],
    });
  });

  it('con la RPC sin desplegar avisa que la función no está disponible', async () => {
    mockRpc.mockResolvedValue({ data: null, error: SIN_RPC });
    await expect(crearCuadrilla('p1', [])).rejects.toThrow(/no está disponible|todavía/i);
  });
});

describe('listarTareas y listarMiembros', () => {
  it('normaliza las tareas a camelCase, ordenadas por la base', async () => {
    const builder = makeQueryBuilder({
      data: [
        {
          id: 't1',
          cuadrilla_id: 'c1',
          titulo: 'Pegar carteles',
          estado: 'tomada',
          tomada_por: 'u2',
          tomada_en: '2026-08-01T12:00:00Z',
          creado_en: '2026-08-01T10:00:00Z',
        },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    await expect(listarTareas('c1')).resolves.toEqual([
      {
        id: 't1',
        cuadrillaId: 'c1',
        titulo: 'Pegar carteles',
        estado: 'tomada',
        tomadaPor: 'u2',
        tomadaEn: '2026-08-01T12:00:00Z',
        creadoEn: '2026-08-01T10:00:00Z',
      },
    ]);
    expect(mockFrom).toHaveBeenCalledWith('cuadrilla_tareas');
    expect(builder.eq).toHaveBeenCalledWith('cuadrilla_id', 'c1');
  });

  it('los miembros traen el nombre del perfil para poder firmar las tareas', async () => {
    mockFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          { user_id: 'u1', creado_en: '2026-08-01T10:00:00Z', profiles: { nombre: 'Ana' } },
        ],
        error: null,
      }),
    );
    await expect(listarMiembros('c1')).resolves.toEqual([
      { userId: 'u1', nombre: 'Ana', creadoEn: '2026-08-01T10:00:00Z' },
    ]);
  });

  it('si el embed a profiles falla, se reintenta SIN él y no se pierde la lista', async () => {
    // Misma escalera que `listarTips`: PostgREST no devuelve datos parciales, y
    // quedarse sin la lista de quién está buscando es mucho peor que quedarse
    // sin los nombres.
    const conNombre = makeQueryBuilder({ data: null, error: { code: '42703' } });
    const sinNombre = makeQueryBuilder({
      data: [{ user_id: 'u1', creado_en: '2026-08-01T10:00:00Z' }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(conNombre).mockReturnValueOnce(sinNombre);
    await expect(listarMiembros('c1')).resolves.toEqual([
      { userId: 'u1', nombre: null, creadoEn: '2026-08-01T10:00:00Z' },
    ]);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('una cuenta borrada firma como vecino, no con el nombre que tenía', async () => {
    mockFrom.mockReturnValue(
      makeQueryBuilder({
        data: [
          {
            user_id: 'u1',
            creado_en: '2026-08-01T10:00:00Z',
            profiles: { nombre: 'Ana', eliminado_en: '2026-08-02T00:00:00Z' },
          },
        ],
        error: null,
      }),
    );
    await expect(listarMiembros('c1')).resolves.toEqual([
      { userId: 'u1', nombre: null, creadoEn: '2026-08-01T10:00:00Z' },
    ]);
  });
});

describe('tomar una tarea con DOS ayudantes al mismo tiempo', () => {
  const FILA_TAREA = {
    id: 't1',
    cuadrilla_id: 'c1',
    titulo: 'Pegar carteles',
    estado: 'tomada',
    tomada_por: 'u1',
    tomada_en: '2026-08-01T12:00:00Z',
    creado_en: '2026-08-01T10:00:00Z',
  };

  it('el update es CONDICIONAL: solo pisa una tarea que sigue pendiente', async () => {
    // El caso real del MVP son dos personas. Sin el `eq('estado','pendiente')`,
    // el segundo que toca el botón le roba la tarea al primero y los dos
    // terminan recorriendo las mismas cuadras.
    const builder = makeQueryBuilder({ data: [FILA_TAREA], error: null });
    mockFrom.mockReturnValue(builder);
    await tomarTarea('t1', 'u1');
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'tomada', tomada_por: 'u1' }),
    );
    expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    expect(builder.eq).toHaveBeenCalledWith('estado', 'pendiente');
  });

  it('si se la ganaron de mano, lo dice; no finge que salió bien', async () => {
    // PostgREST devuelve 200 y CERO filas cuando la RLS (o el `where`) no
    // alcanza ninguna. Sin mirar las filas devueltas, la pantalla diría
    // "la tomaste" y el tablero mostraría otra cosa al recargar.
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(tomarTarea('t1', 'u1')).rejects.toThrow(/adelant|ya la tom/i);
  });

  it('soltar devuelve la tarea a libre, con tomada_por en null', async () => {
    const builder = makeQueryBuilder({
      data: [{ ...FILA_TAREA, estado: 'pendiente', tomada_por: null, tomada_en: null }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    await soltarTarea('t1');
    // El CHECK `(estado = 'pendiente') = (tomada_por is null)` rebota cualquier
    // update que mande solo uno de los dos campos.
    expect(builder.update).toHaveBeenCalledWith({
      estado: 'pendiente',
      tomada_por: null,
      tomada_en: null,
    });
  });

  it('completar deja quién la hizo (si no, no se sabe a quién agradecer)', async () => {
    const builder = makeQueryBuilder({
      data: [{ ...FILA_TAREA, estado: 'hecha' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    await completarTarea('t1');
    const payload = builder.update.mock.calls[0][0];
    expect(payload.estado).toBe('hecha');
    expect(payload).not.toHaveProperty('tomada_por');
  });

  it('un rechazo de la RLS al completar no se informa como éxito', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(completarTarea('t1')).rejects.toThrow();
  });
});

describe('agregar y borrar tareas a mano', () => {
  it('valida el título ANTES de ir a la base', async () => {
    await expect(agregarTarea('c1', '   ')).rejects.toThrow(/Escribí/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('recorta el título y lo inserta en la cuadrilla', async () => {
    const builder = makeQueryBuilder({
      data: {
        id: 't9',
        cuadrilla_id: 'c1',
        titulo: 'Avisar en la vet',
        estado: 'pendiente',
        tomada_por: null,
        tomada_en: null,
        creado_en: '2026-08-01T10:00:00Z',
      },
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const t = await agregarTarea('c1', '  Avisar en la vet  ');
    expect(builder.insert).toHaveBeenCalledWith({
      cuadrilla_id: 'c1',
      titulo: 'Avisar en la vet',
    });
    expect(t.titulo).toBe('Avisar en la vet');
  });

  it('borrar pide las filas borradas: la RLS rechaza sin dar error', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(borrarTarea('t1')).rejects.toThrow(/No se pudo borrar/);
  });
});

describe('la invitación por link', () => {
  const FILA_INVITACION = {
    pet_id: 'p1',
    mascota: 'Rocco',
    especie: 'perro',
    foto: null,
    comuna: 'Maipú',
    reporte_activo: true,
    ayudantes: 2,
    tareas_pendientes: 3,
    ya_estoy: false,
  };

  it('lee la RPC por token y normaliza los números', async () => {
    // PostgREST puede devolver los count() como string (mismo caso que
    // `perfil_publico`): si no se normalizan, "2" + 1 en la pantalla da "21".
    mockRpc.mockResolvedValue({
      data: [{ ...FILA_INVITACION, ayudantes: '2', tareas_pendientes: '3' }],
      error: null,
    });
    const r = await invitacionPorToken('tok-abc');
    expect(mockRpc).toHaveBeenCalledWith('cuadrilla_por_invitacion', { p_token: 'tok-abc' });
    expect(r).toEqual({
      tipo: 'ok',
      invitacion: {
        petId: 'p1',
        mascota: 'Rocco',
        especie: 'perro',
        foto: null,
        comuna: 'Maipú',
        reporteActivo: true,
        ayudantes: 2,
        tareasPendientes: 3,
        yaEstoy: false,
      },
    });
  });

  it('token inexistente → "no-existe" (la RPC devuelve 0 filas a propósito)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(invitacionPorToken('gastado')).resolves.toEqual({ tipo: 'no-existe' });
  });

  it('con la migración sin aplicar → "no-disponible", no "no-existe"', async () => {
    // La diferencia importa: "no existe" le dice al vecino que el link está
    // vencido y que no hay nada que hacer. Si el motivo real es que falta correr
    // el SQL, eso es mentirle.
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(invitacionPorToken('tok-abc')).resolves.toEqual({ tipo: 'no-disponible' });
  });

  it('un corte de red se propaga (hay algo que reintentar)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: RED_CAIDA });
    await expect(invitacionPorToken('tok-abc')).rejects.toBeDefined();
  });

  it('sumarse devuelve el id de la cuadrilla', async () => {
    mockRpc.mockResolvedValue({ data: 'c1', error: null });
    await expect(sumarmeALaCuadrilla('tok-abc')).resolves.toBe('c1');
    expect(mockRpc).toHaveBeenCalledWith('sumarme_a_la_cuadrilla', { p_token: 'tok-abc' });
  });

  it('sumarse con un token gastado devuelve null, sin inventar un error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(sumarmeALaCuadrilla('gastado')).resolves.toBeNull();
  });
});
