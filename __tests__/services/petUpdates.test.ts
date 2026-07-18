import { addUpdate, listUpdates } from '../../src/services/petUpdates';

// Builder falso encadenable (select/insert/eq/order son chainable; single y el
// `await` final resuelven al resultado configurado).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
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

describe('addUpdate', () => {
  it('inserta la novedad con el texto limpio y devuelve la fila', async () => {
    const fila = {
      id: 'u1', pet_id: 'petA', user_id: 'dueño',
      texto: 'Sigo buscando', creado_en: '2026-07-16T10:00:00Z',
    };
    const builder = makeQueryBuilder({ data: fila, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'pet_updates') return builder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const res = await addUpdate('petA', 'dueño', '  Sigo buscando  ');
    expect(res).toEqual(fila);
    expect(mockFrom).toHaveBeenCalledWith('pet_updates');
    expect(builder.insert).toHaveBeenCalledWith({
      pet_id: 'petA', user_id: 'dueño', texto: 'Sigo buscando',
    });
  });

  it('rechaza una novedad vacía sin tocar la base', async () => {
    await expect(addUpdate('petA', 'dueño', '   ')).rejects.toThrow('La novedad está vacía');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propaga el error de supabase al insertar', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockImplementation(() => builder);
    await expect(addUpdate('petA', 'dueño', 'algo')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listUpdates', () => {
  it('lista las novedades del reporte de más nueva a más vieja', async () => {
    const filas = [
      { id: 'u2', pet_id: 'petA', user_id: 'dueño', texto: 'Pista en el sur', creado_en: '2026-07-16T11:00:00Z' },
      { id: 'u1', pet_id: 'petA', user_id: 'dueño', texto: 'Sigo buscando', creado_en: '2026-07-16T10:00:00Z' },
    ];
    const builder = makeQueryBuilder({ data: filas, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'pet_updates') return builder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const res = await listUpdates('petA');
    expect(res).toEqual(filas);
    expect(builder.eq).toHaveBeenCalledWith('pet_id', 'petA');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
  });

  it('devuelve [] cuando no hay novedades', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation(() => builder);
    const res = await listUpdates('petA');
    expect(res).toEqual([]);
  });

  it('propaga el error de supabase al listar', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockImplementation(() => builder);
    await expect(listUpdates('petA')).rejects.toEqual({ message: 'boom' });
  });
});
