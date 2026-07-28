import {
  bloquear,
  listarBloqueados,
  desbloquear,
  bloqueEmitido,
  hayBloqueoCon,
  idsBloqueados,
  filtrarBloqueados,
} from '../../src/services/bloqueos';

// Builder falso encadenable (mismo patrón que alertZones.test.ts / profile.test.ts).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'yo' } } });
});

// ------------------------------------------------------------
// Lógica pura: filtrarBloqueados
// ------------------------------------------------------------
describe('filtrarBloqueados', () => {
  const item = (id: string, autor: string) => ({ id, autor });

  it('quita los items cuyo autor está bloqueado', () => {
    const items = [item('a', 'u1'), item('b', 'u2'), item('c', 'u1')];
    const res = filtrarBloqueados(items, new Set(['u1']), (i) => i.autor);
    expect(res.map((i) => i.id)).toEqual(['b']);
  });

  it('devuelve la misma lista cuando no hay bloqueados (atajo)', () => {
    const items = [item('a', 'u1')];
    const res = filtrarBloqueados(items, new Set(), (i) => i.autor);
    expect(res).toBe(items);
  });

  it('conserva items sin autor resoluble (null/undefined)', () => {
    const items = [item('a', 'u1'), { id: 'b', autor: null as any }];
    const res = filtrarBloqueados(items, new Set(['u1']), (i) => i.autor);
    expect(res.map((i) => i.id)).toEqual(['b']);
  });

  it('no muta la lista original', () => {
    const items = [item('a', 'u1'), item('b', 'u2')];
    filtrarBloqueados(items, new Set(['u1']), (i) => i.autor);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

// ------------------------------------------------------------
// Acceso a la base
// ------------------------------------------------------------
describe('bloquear', () => {
  it('inserta la fila anclada a mi id como bloqueador', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    await bloquear('otro');
    expect(mockFrom).toHaveBeenCalledWith('bloqueos');
    expect(builder.insert).toHaveBeenCalledWith({ bloqueador: 'yo', bloqueado: 'otro' });
  });

  it('trata el duplicado (23505) como éxito idempotente', async () => {
    const builder = makeQueryBuilder({ data: null, error: { code: '23505' } });
    mockFrom.mockReturnValue(builder);
    await expect(bloquear('otro')).resolves.toBeUndefined();
  });

  it('propaga cualquier otro error', async () => {
    const builder = makeQueryBuilder({ data: null, error: { code: '42501' } });
    mockFrom.mockReturnValue(builder);
    await expect(bloquear('otro')).rejects.toEqual({ code: '42501' });
  });

  it('exige sesión abierta', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(bloquear('otro')).rejects.toThrow(/sesión/i);
  });
});

describe('desbloquear', () => {
  it('borra filtrando por mi id y el del otro', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    await desbloquear('otro');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('bloqueador', 'yo');
    expect(builder.eq).toHaveBeenCalledWith('bloqueado', 'otro');
  });
});

describe('bloqueEmitido', () => {
  it('devuelve true cuando existe mi fila de bloqueo', async () => {
    const builder = makeQueryBuilder({ data: { bloqueado: 'otro' }, error: null });
    mockFrom.mockReturnValue(builder);
    await expect(bloqueEmitido('otro')).resolves.toBe(true);
  });

  it('devuelve false cuando no existe', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    await expect(bloqueEmitido('otro')).resolves.toBe(false);
  });
});

describe('hayBloqueoCon', () => {
  it('llama al RPC de un solo parámetro y devuelve booleano', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(hayBloqueoCon('otro')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('hay_bloqueo_con', { p_otro: 'otro' });
  });

  it('propaga el error del RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(hayBloqueoCon('otro')).rejects.toEqual({ code: '42501' });
  });
});

describe('idsBloqueados', () => {
  it('devuelve el conjunto de ids que bloqueé', async () => {
    const builder = makeQueryBuilder({
      data: [{ bloqueado: 'u1' }, { bloqueado: 'u2' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const set = await idsBloqueados();
    expect(set).toEqual(new Set(['u1', 'u2']));
  });

  it('degrada a conjunto vacío sin sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(idsBloqueados()).resolves.toEqual(new Set());
  });

  it('degrada a conjunto vacío si la consulta falla (tabla sin migrar)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { code: '42P01' } });
    mockFrom.mockReturnValue(builder);
    await expect(idsBloqueados()).resolves.toEqual(new Set());
  });
});

// ------------------------------------------------------------
// listarBloqueados — alimenta la pantalla "Personas bloqueadas"
// ------------------------------------------------------------
describe('listarBloqueados', () => {
  const filas = [
    { bloqueado: 'u2', creado_en: '2026-07-20T10:00:00Z' },
    { bloqueado: 'u1', creado_en: '2026-07-10T10:00:00Z' },
  ];

  it('devuelve mis bloqueos con el nombre de cada persona, del mas nuevo al mas viejo', async () => {
    const bloqueosB = makeQueryBuilder({ data: filas, error: null });
    const perfilesB = makeQueryBuilder({
      data: [{ id: 'u1', nombre: 'Ana' }, { id: 'u2', nombre: 'Beto' }],
      error: null,
    });
    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === 'bloqueos') return bloqueosB;
      if (tabla === 'profiles') return perfilesB;
      throw new Error(`tabla inesperada: ${tabla}`);
    });

    const res = await listarBloqueados();
    expect(res).toEqual([
      { userId: 'u2', nombre: 'Beto', creadoEn: '2026-07-20T10:00:00Z' },
      { userId: 'u1', nombre: 'Ana', creadoEn: '2026-07-10T10:00:00Z' },
    ]);
    // Ancla la lectura a MIS filas: la RLS de la 0022 no deja otra cosa, pero
    // si el filtro se cayera la consulta seguiria "funcionando" (vacia) y nadie
    // se enteraria.
    expect(bloqueosB.eq).toHaveBeenCalledWith('bloqueador', 'yo');
    expect(bloqueosB.order).toHaveBeenCalledWith('creado_en', { ascending: false });
  });

  it('si no se pueden leer los nombres igual devuelve las filas (rotulo generico)', async () => {
    const bloqueosB = makeQueryBuilder({ data: filas, error: null });
    const perfilesB = makeQueryBuilder({ data: null, error: { code: '42501' } });
    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === 'bloqueos') return bloqueosB;
      if (tabla === 'profiles') return perfilesB;
      throw new Error(`tabla inesperada: ${tabla}`);
    });

    const res = await listarBloqueados();
    // Sin esto, un fallo al leer nombres dejaria a la persona SIN poder
    // desbloquear a nadie, que es peor que un nombre generico.
    expect(res.map((p) => p.userId)).toEqual(['u2', 'u1']);
    expect(res.every((p) => p.nombre === null)).toBe(true);
  });

  it('sin bloqueos no consulta perfiles', async () => {
    const bloqueosB = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((tabla: string) => {
      if (tabla === 'bloqueos') return bloqueosB;
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    await expect(listarBloqueados()).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith('profiles');
  });

  it('propaga el error al leer los bloqueos', async () => {
    const bloqueosB = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(bloqueosB);
    await expect(listarBloqueados()).rejects.toEqual({ message: 'boom' });
  });

  it('exige sesion abierta', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(listarBloqueados()).rejects.toThrow(/sesión/i);
  });
});
