import { getImpacto } from '../../src/services/impacto';

const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('getImpacto', () => {
  it('normaliza numeros (bigint como string) desde la RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ reencuentros: '12', buscando: '5', adopciones: '3', aportes: '40' }],
      error: null,
    });

    const i = await getImpacto();

    expect(mockRpc).toHaveBeenCalledWith('impacto_comunidad');
    expect(i).toEqual({ reencuentros: 12, buscando: 5, adopciones: 3, aportes: 40 });
  });

  it('devuelve null si la RPC falla', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const i = await getImpacto();

    expect(i).toBeNull();
  });

  it('devuelve null si no hay filas', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const i = await getImpacto();

    expect(i).toBeNull();
  });
});

describe('getImpacto con la RPC 0070 (tasa y mediana)', () => {
  it('mapea perdidas_historicas y mediana_dias', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          reencuentros: 4,
          buscando: 2,
          adopciones: 1,
          aportes: 9,
          perdidas_historicas: '10',
          mediana_dias: '4.5',
        },
      ],
      error: null,
    });

    const r = await getImpacto();

    expect(r?.perdidasHistoricas).toBe(10);
    expect(r?.medianaDias).toBe(4.5);
  });

  it('RPC vieja (sin columnas nuevas) => undefined, no 0', async () => {
    mockRpc.mockResolvedValue({
      data: [{ reencuentros: 4, buscando: 2, adopciones: 1, aportes: 9 }],
      error: null,
    });

    const r = await getImpacto();

    expect(r?.perdidasHistoricas).toBeUndefined();
    expect(r?.medianaDias).toBeUndefined();
  });

  it('mediana_dias null (menos de 3 reencuentros) queda null, no NaN', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { reencuentros: 2, buscando: 0, adopciones: 0, aportes: 0, perdidas_historicas: 3, mediana_dias: null },
      ],
      error: null,
    });

    const r = await getImpacto();

    expect(r?.medianaDias).toBeNull();
  });
});
