import { markReunited, listFinalesFelices } from '../../src/services/reunions';

// Builder falso que imita el encadenado de supabase-js. Incluye `not` y
// `limit` porque listFinalesFelices los usa.
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
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

describe('markReunited', () => {
  it('cierra el reporte con reunida_en, nota y foto', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await markReunited('pet-1', { nota: '  Apareció sana  ', foto: 'https://f/1.jpg' });

    expect(mockFrom).toHaveBeenCalledWith('pets');
    const fields = builder.update.mock.calls[0][0];
    expect(fields.activo).toBe(false);
    expect(typeof fields.reunida_en).toBe('string');
    expect(fields.final_feliz).toBe('Apareció sana'); // recortada
    expect(fields.final_foto).toBe('https://f/1.jpg');
    expect(builder.eq).toHaveBeenCalledWith('id', 'pet-1');
  });

  it('deja nota y foto en null cuando no se pasan', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await markReunited('pet-1');

    const fields = builder.update.mock.calls[0][0];
    expect(fields.final_feliz).toBeNull();
    expect(fields.final_foto).toBeNull();
  });

  it('propaga el error si supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(markReunited('pet-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listFinalesFelices', () => {
  it('filtra cerrados con reunida_en no nulo, ordena y limita', async () => {
    const rows = [{ id: 'pet-1', reunida_en: '2026-07-18T00:00:00Z' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listFinalesFelices(5);

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.eq).toHaveBeenCalledWith('activo', false);
    expect(builder.not).toHaveBeenCalledWith('reunida_en', 'is', null);
    expect(builder.order).toHaveBeenCalledWith('reunida_en', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(5);
    expect(pets).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listFinalesFelices();
    expect(pets).toEqual([]);
  });
});
