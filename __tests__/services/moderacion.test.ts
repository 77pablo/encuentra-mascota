import { bandeja, descartar, retirar, suspender } from '../../src/services/moderacion';

const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe('bandeja', () => {
  it('mapea las filas de la RPC (snake_case -> camelCase)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'd1', tipo: 'pista', motivo: 'Spam', detalle: null, creado_en: 'x',
          reporter_id: 'r', reporter_nombre: 'Ana', denunciado_id: 'u', denunciado_nombre: 'Bob',
          objeto_id: 'o', pet_id: null, denuncias_contra_denunciado: 3, contenido: { texto: 'hola' },
        },
      ],
      error: null,
    });

    const filas = await bandeja();

    expect(mockRpc).toHaveBeenCalledWith('moderacion_bandeja');
    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      id: 'd1', tipo: 'pista', motivo: 'Spam', detalle: null, creadoEn: 'x',
      reporterId: 'r', reporterNombre: 'Ana', denunciadoId: 'u', denunciadoNombre: 'Bob',
      objetoId: 'o', petId: null, denunciasContraDenunciado: 3, contenido: { texto: 'hola' },
    });
  });

  it('devuelve lista vacia cuando la RPC no trae filas', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(bandeja()).resolves.toEqual([]);
  });

  it('propaga el error de la RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no autorizado' } });
    await expect(bandeja()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('retirar', () => {
  it('llama al RPC con el id de la denuncia', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await retirar('d1');
    expect(mockRpc).toHaveBeenCalledWith('moderar_retirar', { p_denuncia_id: 'd1' });
  });

  it('propaga el error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(retirar('d1')).rejects.toEqual({ code: '42501' });
  });
});

describe('descartar', () => {
  it('llama al RPC con el id de la denuncia', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await descartar('d1');
    expect(mockRpc).toHaveBeenCalledWith('moderar_descartar', { p_denuncia_id: 'd1' });
  });
});

describe('suspender', () => {
  it('llama al RPC con el id del usuario', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await suspender('u1');
    expect(mockRpc).toHaveBeenCalledWith('moderar_suspender', { p_usuario_id: 'u1' });
  });
});
