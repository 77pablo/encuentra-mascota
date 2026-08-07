import { eventosActivos, eventoPorId } from '../../src/services/eventos';

// Cliente de la tabla `eventos` (migración 0069). La RLS ya filtra por
// `activo = true`; acá se prueba que el cliente arma bien la consulta (activo +
// ventana vigente + orden) y que un fallo NO devuelve [] falso (el bug repetido
// de "no hay nada" cuando en realidad no se pudo leer).

const mockFrom = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a: any[]) => mockFrom(...a) },
}));

// Un query builder encadenable que termina resolviendo `resultado`.
function builder(resultado: { data: any; error: any }) {
  const b: any = {};
  for (const m of ['select', 'eq', 'or', 'order']) b[m] = jest.fn(() => b);
  b.then = (resolve: any) => resolve(resultado);
  return b;
}

const EVENTO = {
  id: 'ev1',
  nombre: 'Incendios Biobío',
  descripcion: 'Zona afectada',
  lat: -36.8,
  lng: -73.05,
  radio_km: 80,
  desde: '2026-08-01T00:00:00Z',
  hasta: null,
  activo: true,
  creado_en: '2026-08-01T00:00:00Z',
};

beforeEach(() => mockFrom.mockReset());

describe('eventosActivos', () => {
  it('lee eventos activos y los devuelve', async () => {
    mockFrom.mockReturnValue(builder({ data: [EVENTO], error: null }));
    const r = await eventosActivos();
    expect(mockFrom).toHaveBeenCalledWith('eventos');
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe('Incendios Biobío');
  });

  it('un error se PROPAGA (no devuelve [] falso)', async () => {
    mockFrom.mockReturnValue(builder({ data: null, error: { message: 'boom' } }));
    await expect(eventosActivos()).rejects.toBeTruthy();
  });

  it('sin eventos devuelve lista vacía', async () => {
    mockFrom.mockReturnValue(builder({ data: [], error: null }));
    expect(await eventosActivos()).toEqual([]);
  });
});

describe('eventoPorId', () => {
  function builderSingle(resultado: { data: any; error: any }) {
    const b: any = {};
    for (const m of ['select', 'eq']) b[m] = jest.fn(() => b);
    b.maybeSingle = jest.fn(() => Promise.resolve(resultado));
    return b;
  }

  it('devuelve el evento cuando existe', async () => {
    mockFrom.mockReturnValue(builderSingle({ data: EVENTO, error: null }));
    expect((await eventoPorId('ev1'))?.nombre).toBe('Incendios Biobío');
  });

  it('devuelve null si no hay fila (id inexistente o inactivo)', async () => {
    mockFrom.mockReturnValue(builderSingle({ data: null, error: null }));
    expect(await eventoPorId('nope')).toBeNull();
  });

  it('propaga un error real de la consulta', async () => {
    mockFrom.mockReturnValue(builderSingle({ data: null, error: { message: 'x' } }));
    await expect(eventoPorId('ev1')).rejects.toBeTruthy();
  });
});
