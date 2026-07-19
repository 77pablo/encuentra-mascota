import { getMyProfile, updateMyProfile } from '../../src/services/profile';

// Builder falso encadenable (select/update/eq son chainable, el resultado
// final se resuelve al hacer `await`, `.single()` o `.maybeSingle()`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
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

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('getMyProfile', () => {
  it('pide la RPC sin pasarle ningun id', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'u1', nombre: 'Pablo', telefono: '+569' }], error: null });

    const perfil = await getMyProfile();

    expect(mockRpc).toHaveBeenCalledWith('mi_perfil');
    expect(mockRpc.mock.calls[0].length).toBe(1); // sin argumentos: el servidor decide de quien es la fila
    expect(perfil?.telefono).toBe('+569');
  });

  it('devuelve null si la RPC no trae filas', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getMyProfile()).toBeNull();
  });

  // Mientras la app nueva este arriba y la migracion 0018 todavia no, la RPC no
  // existe. Sin este escalon nadie veria su perfil en esa ventana.
  it('si la RPC no existe todavia, cae al select de siempre', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
    const builder = makeQueryBuilder({ data: { id: 'u1', nombre: 'Pablo' }, error: null });
    mockFrom.mockReturnValue(builder);

    const perfil = await getMyProfile('u1');

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(perfil?.nombre).toBe('Pablo');
  });

  it('propaga los errores que no son "la RPC no existe"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(getMyProfile()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('updateMyProfile', () => {
  it('llama a update(fields).eq(id) sobre la tabla profiles', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyProfile('user-1', { nombre: 'Nuevo Nombre' });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Nuevo Nombre' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(updateMyProfile('user-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});
