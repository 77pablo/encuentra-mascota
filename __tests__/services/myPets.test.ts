import {
  createMyPet,
  deleteMyPet,
  listMyPets,
  updateMyPet,
} from '../../src/services/myPets';

// Builder falso que imita el encadenado de supabase-js (mismo patrón que pets.test.ts).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const UID = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://ywlrcfaybnikaurxsgtj.supabase.co/storage/v1/object/public/pet-photos';

const mockFrom = jest.fn();
const mockRemove = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: () => ({ remove: (...rargs: any[]) => mockRemove(...rargs) }),
    },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRemove.mockReset();
  mockRemove.mockResolvedValue({ data: [], error: null });
});

describe('listMyPets', () => {
  it('filtra por user_id y ordena por creado_en desc', async () => {
    const rows = [{ id: 'mp-1' }, { id: 'mp-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const fichas = await listMyPets('user-1');

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(fichas).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await listMyPets('user-1')).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listMyPets('user-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('createMyPet', () => {
  it('inserta con user_id y foto, y NO fija collar_token (lo pone el servidor)', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1', nombre: 'Pelusa' }, error: null });
    mockFrom.mockReturnValue(builder);

    const ficha = await createMyPet(
      { nombre: 'Pelusa', especie: 'perro', raza: 'quiltro', senas: 'mancha', chip: '123' },
      'https://foto/1.jpg',
      'user-1',
    );

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado).toMatchObject({ user_id: 'user-1', foto: 'https://foto/1.jpg', nombre: 'Pelusa' });
    expect(guardado).not.toHaveProperty('collar_token');
    expect(ficha).toEqual({ id: 'mp-1', nombre: 'Pelusa' });
  });

  it('convierte los opcionales vacíos en null (no guarda cadenas vacías)', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet({ nombre: 'Sol', especie: 'gato', raza: '', senas: '', chip: '' }, null, 'user-1');

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.raza).toBeNull();
    expect(guardado.senas).toBeNull();
    expect(guardado.chip).toBeNull();
    expect(guardado.foto).toBeNull();
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(
      createMyPet({ nombre: 'Sol', especie: 'gato' }, null, 'user-1'),
    ).rejects.toEqual({ message: 'boom' });
  });
});

describe('updateMyPet', () => {
  it('llama a update(fields).eq(id) sobre my_pets', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', { nombre: 'Firulais', raza: '', senas: 'nueva seña', chip: '' });

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    // Los opcionales vacíos se normalizan a null también al editar.
    expect(builder.update).toHaveBeenCalledWith({
      nombre: 'Firulais', raza: null, senas: 'nueva seña', chip: null,
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'mp-1');
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(updateMyPet('mp-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});

describe('deleteMyPet', () => {
  it('borra la foto del bucket ANTES de borrar la fila', async () => {
    const orden: string[] = [];
    const builder: any = {
      select: jest.fn(() => builder),
      delete: jest.fn(() => {
        orden.push('delete');
        return builder;
      }),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: { foto: `${BASE}/${UID}/a.jpg` }, error: null }),
      ),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };
    mockFrom.mockImplementation(() => builder);
    mockRemove.mockImplementation(() => {
      orden.push('storage');
      return Promise.resolve({ data: [], error: null });
    });

    await deleteMyPet('mp-1', UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`]);
    expect(orden).toEqual(['storage', 'delete']);
  });

  it('no llama a Storage si la ficha no tiene foto', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteMyPet('mp-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('ignora una foto que no es del propio usuario', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: `${BASE}/${OTRO}/x.jpg` }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteMyPet('mp-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('borra la fila igual si Storage falla', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: `${BASE}/${UID}/a.jpg` }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockRemove.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(deleteMyPet('mp-1', UID)).resolves.toBeUndefined();
  });

  it('propaga el error si falla el borrado de la fila', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }));

    await expect(deleteMyPet('mp-1', UID)).rejects.toEqual({ message: 'boom' });
  });
});
