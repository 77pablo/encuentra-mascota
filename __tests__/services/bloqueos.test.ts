import {
  bloquear,
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
