import {
  BusquedaGuardada,
  borrarBusqueda,
  guardarBusqueda,
  listBusquedas,
} from '../../src/services/busquedasGuardadas';

// Builder falso encadenable (mismo patrón que bloqueos.test.ts / myPets.test.ts).
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
const mockGetUser = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'yo' } } });
});

describe('listBusquedas', () => {
  it('trae las búsquedas ordenadas de la más nueva a la más vieja', async () => {
    const rows: BusquedaGuardada[] = [
      { id: 'b1', user_id: 'yo', tipo: 'perdida', especie: 'gato', comuna: 'Ñuñoa', creado_en: '2026-07-20T10:00:00Z' },
    ];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const busquedas = await listBusquedas();

    expect(mockFrom).toHaveBeenCalledWith('busquedas_guardadas');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(busquedas).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await listBusquedas()).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listBusquedas()).rejects.toEqual({ message: 'boom' });
  });
});

describe('guardarBusqueda', () => {
  it('inserta con mi user_id, especie null si no viene', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await guardarBusqueda({ tipo: 'perdida', comuna: 'Maipú' });

    expect(mockFrom).toHaveBeenCalledWith('busquedas_guardadas');
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'yo', tipo: 'perdida', especie: null, comuna: 'Maipú',
    });
  });

  it('inserta la especie cuando viene', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await guardarBusqueda({ tipo: 'encontrada', especie: 'gato', comuna: 'Ñuñoa' });

    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'yo', tipo: 'encontrada', especie: 'gato', comuna: 'Ñuñoa',
    });
  });

  it('exige sesión abierta', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(guardarBusqueda({ tipo: 'perdida', comuna: 'Maipú' })).rejects.toThrow(/sesión/i);
  });

  it('traduce el tope de 5 búsquedas a un mensaje amigable', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'BUSQUEDAS_TOPE' } });
    mockFrom.mockReturnValue(builder);

    await expect(guardarBusqueda({ tipo: 'perdida', comuna: 'Maipú' })).rejects.toThrow(
      /ya tenés 5 búsquedas guardadas/i,
    );
  });

  it('propaga cualquier otro error tal cual', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(guardarBusqueda({ tipo: 'perdida', comuna: 'Maipú' })).rejects.toEqual({ message: 'boom' });
  });
});

describe('borrarBusqueda', () => {
  it('borra y pide las filas devueltas', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'b1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await borrarBusqueda('b1');

    expect(mockFrom).toHaveBeenCalledWith('busquedas_guardadas');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'b1');
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('lanza un error amigable si la RLS rechazó el borrado (0 filas)', async () => {
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await expect(borrarBusqueda('b1')).rejects.toThrow(/no se pudo borrar/i);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(borrarBusqueda('b1')).rejects.toEqual({ message: 'boom' });
  });
});
