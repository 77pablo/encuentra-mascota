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
