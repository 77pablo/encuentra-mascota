import { addSighting, listSightings, deleteSighting } from '../../src/services/sightings';

// Builder falso que imita el encadenado de supabase-js (select/insert/delete/
// eq/order son chainable y el resultado final es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
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

describe('addSighting', () => {
  it('inserta el avistamiento con nota/foto normalizadas y devuelve la fila', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-1', pet_id: 'pet-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const s = await addSighting({
      pet_id: 'pet-1',
      user_id: 'user-1',
      lat: -33.4,
      lng: -70.6,
      nota: 'Lo vi cruzando la plaza',
    });

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pet_id: 'pet-1',
        user_id: 'user-1',
        lat: -33.4,
        lng: -70.6,
        nota: 'Lo vi cruzando la plaza',
        foto: null,
      }),
    );
    expect(s).toEqual({ id: 's-1', pet_id: 'pet-1' });
  });

  it('convierte nota/foto ausentes en null', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-2' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addSighting({ pet_id: 'pet-1', user_id: 'user-1', lat: 0, lng: 0 });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nota: null, foto: null }),
    );
  });

  it('propaga el error de supabase (ej. RLS)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      addSighting({ pet_id: 'pet-1', user_id: 'user-1', lat: 0, lng: 0 }),
    ).rejects.toEqual({ message: 'boom' });
  });
});

describe('listSightings', () => {
  it('filtra por pet_id y ordena por creado_en desc', async () => {
    const rows = [{ id: 's-1' }, { id: 's-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const list = await listSightings('pet-1');

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    expect(builder.eq).toHaveBeenCalledWith('pet_id', 'pet-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(list).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    expect(await listSightings('pet-1')).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listSightings('pet-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('deleteSighting', () => {
  it('llama a delete().eq(id) sobre la tabla sightings', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await deleteSighting('s-1');

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 's-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(deleteSighting('s-1')).rejects.toEqual({ message: 'boom' });
  });
});
