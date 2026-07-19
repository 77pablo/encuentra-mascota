import { borrarMiCuenta } from '../../src/services/account';

const mockInvoke = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('borrarMiCuenta', () => {
  it('invoca la Edge Function delete-account', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await borrarMiCuenta();

    expect(mockInvoke).toHaveBeenCalledWith('delete-account', { body: {} });
  });

  it('rechaza con mensaje de reintento cuando la funcion devuelve error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(borrarMiCuenta()).rejects.toThrow(/volv.+a intentar/i);
  });

  it('rechaza cuando la respuesta no confirma el borrado (sin ok)', async () => {
    // Este es el caso central: si la Edge Function responde 200 pero sin
    // { ok: true }, NO hay que darlo por exito. Una cuenta que sigue viva
    // no puede tratarse como borrada, o la persona se va creyendo que sus
    // datos ya no estan cuando en realidad siguen ahi.
    mockInvoke.mockResolvedValue({ data: {}, error: null });

    await expect(borrarMiCuenta()).rejects.toThrow(/volv.+a intentar/i);
  });

  it('resuelve sin lanzar cuando la respuesta confirma el borrado', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(borrarMiCuenta()).resolves.toBeUndefined();
  });
});
