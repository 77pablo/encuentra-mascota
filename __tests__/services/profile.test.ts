import { getMyProfile, updateMyProfile } from '../../src/services/profile';

// Builder falso encadenable (select/update/eq son chainable, el resultado
// final se resuelve al hacer `await` o al llamar `.single()`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
});

describe('getMyProfile', () => {
  it('busca por id en profiles y devuelve la fila', async () => {
    const row = { id: 'user-1', nombre: 'Ana', foto_perfil: null, creado_en: '2026-01-01T00:00:00Z' };
    const builder = makeQueryBuilder({ data: row, error: null });
    mockFrom.mockReturnValue(builder);

    const profile = await getMyProfile('user-1');

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(profile).toEqual(row);
  });

  it('devuelve null cuando no hay data', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const profile = await getMyProfile('user-1');
    expect(profile).toBeNull();
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(getMyProfile('user-1')).rejects.toEqual({ message: 'boom' });
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
