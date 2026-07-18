import {
  addFavorite,
  removeFavorite,
  listMyFavoriteIds,
  listMyFavorites,
} from '../../src/services/favorites';

// Builder falso encadenable (mismo patrón que profile.test.ts / pets.test.ts):
// select/insert/delete/eq/order son chainable y el resultado se resuelve al
// hacer `await`.
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
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

describe('addFavorite', () => {
  it('inserta {user_id, pet_id} en favorites', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await addFavorite('user-1', 'pet-1');

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(builder.insert).toHaveBeenCalledWith({ user_id: 'user-1', pet_id: 'pet-1' });
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(addFavorite('user-1', 'pet-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('removeFavorite', () => {
  it('borra por user_id y pet_id en favorites', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await removeFavorite('user-1', 'pet-1');

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'pet_id', 'pet-1');
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(removeFavorite('user-1', 'pet-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listMyFavoriteIds', () => {
  it('devuelve solo los pet_id del usuario', async () => {
    const rows = [{ pet_id: 'pet-1' }, { pet_id: 'pet-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const ids = await listMyFavoriteIds('user-1');

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(builder.select).toHaveBeenCalledWith('pet_id');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(ids).toEqual(['pet-1', 'pet-2']);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const ids = await listMyFavoriteIds('user-1');
    expect(ids).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyFavoriteIds('user-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listMyFavorites', () => {
  it('trae el join a pets ordenado por creado_en desc y devuelve las mascotas', async () => {
    const rows = [
      { creado_en: '2026-02-01T00:00:00Z', pets: { id: 'pet-2' } },
      { creado_en: '2026-01-01T00:00:00Z', pets: { id: 'pet-1' } },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listMyFavorites('user-1');

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(builder.select).toHaveBeenCalledWith('creado_en, pets(*)');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(pets).toEqual([{ id: 'pet-2' }, { id: 'pet-1' }]);
  });

  it('descarta filas cuya mascota ya no existe (pets null)', async () => {
    const rows = [
      { creado_en: '2026-02-01T00:00:00Z', pets: null },
      { creado_en: '2026-01-01T00:00:00Z', pets: { id: 'pet-1' } },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listMyFavorites('user-1');
    expect(pets).toEqual([{ id: 'pet-1' }]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyFavorites('user-1')).rejects.toEqual({ message: 'boom' });
  });
});
