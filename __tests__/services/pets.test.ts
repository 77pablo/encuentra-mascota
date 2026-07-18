import {
  createPet,
  deletePet,
  listLostBySpecies,
  listMyReports,
  updatePet,
} from '../../src/services/pets';

// Builder falso que imita el encadenado de supabase-js (select/insert/update/
// delete/eq/order son chainable y el resultado final es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
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

describe('createPet', () => {
  it('inserta el reporte con user_id y fotos y devuelve la fila', async () => {
    const builder = makeQueryBuilder({ data: { id: 'pet-1', estado: 'perdida' }, error: null });
    mockFrom.mockReturnValue(builder);

    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    const pet = await createPet(input, ['https://foto/1.jpg'], 'user-1');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', fotos: ['https://foto/1.jpg'], estado: 'perdida' }),
    );
    expect(pet).toEqual({ id: 'pet-1', estado: 'perdida' });
  });

  it('propaga el error de supabase (ej. límite anti-spam)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'Alcanzaste el límite de publicaciones por ahora. Intenta de nuevo en un rato.' } });
    mockFrom.mockReturnValue(builder);

    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    await expect(createPet(input, [], 'user-1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('límite de publicaciones') }),
    );
  });
});

describe('updatePet', () => {
  it('llama a update(fields).eq(id) sobre la tabla pets', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updatePet('pet-1', { nombre: 'Firulais' });

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Firulais' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'pet-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(updatePet('pet-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});

describe('deletePet', () => {
  it('llama a delete().eq(id) sobre la tabla pets', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await deletePet('pet-1');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'pet-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(deletePet('pet-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listLostBySpecies', () => {
  it('filtra activo=true, estado=perdida, especie=X y ordena por creado_en desc', async () => {
    const rows = [{ id: 'pet-1' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listLostBySpecies('perro');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'activo', true);
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'estado', 'perdida');
    expect(builder.eq).toHaveBeenNthCalledWith(3, 'especie', 'perro');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(pets).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listLostBySpecies('gato');
    expect(pets).toEqual([]);
  });
});

describe('listMyReports', () => {
  it('filtra por user_id y activo, y ordena por creado_en desc', async () => {
    const rows = [{ id: 'pet-1' }, { id: 'pet-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listMyReports('user-1', true);

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'activo', true);
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(pets).toEqual(rows);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyReports('user-1', false)).rejects.toEqual({ message: 'boom' });
  });
});
