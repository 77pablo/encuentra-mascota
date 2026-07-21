import {
  addAdoptionSave,
  removeAdoptionSave,
  listMyAdoptionSaveIds,
} from '../../src/services/adoptionSaves';

// Mismo builder falso encadenable que favorites.test.ts / pets.test.ts:
// select/insert/delete/eq son chainable y el resultado se resuelve al
// hacer `await`.
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
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

describe('addAdoptionSave', () => {
  it('inserta {user_id, adoption_id} en adoption_saves', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await addAdoptionSave('user-1', 'ad-1');

    expect(mockFrom).toHaveBeenCalledWith('adoption_saves');
    expect(builder.insert).toHaveBeenCalledWith({ user_id: 'user-1', adoption_id: 'ad-1' });
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(addAdoptionSave('user-1', 'ad-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('removeAdoptionSave', () => {
  it('borra por user_id y adoption_id en adoption_saves', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await removeAdoptionSave('user-1', 'ad-1');

    expect(mockFrom).toHaveBeenCalledWith('adoption_saves');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'adoption_id', 'ad-1');
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(removeAdoptionSave('user-1', 'ad-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listMyAdoptionSaveIds', () => {
  it('devuelve solo los adoption_id del usuario', async () => {
    const rows = [{ adoption_id: 'ad-1' }, { adoption_id: 'ad-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const ids = await listMyAdoptionSaveIds('user-1');

    expect(mockFrom).toHaveBeenCalledWith('adoption_saves');
    expect(builder.select).toHaveBeenCalledWith('adoption_id');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(ids).toEqual(['ad-1', 'ad-2']);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const ids = await listMyAdoptionSaveIds('user-1');
    expect(ids).toEqual([]);
  });

  it('propaga el error de supabase (la tabla no existe, etc.)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyAdoptionSaveIds('user-1')).rejects.toEqual({ message: 'boom' });
  });
});
