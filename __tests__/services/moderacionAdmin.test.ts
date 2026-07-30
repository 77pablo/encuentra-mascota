import {
  bandeja,
  descartar,
  reactivar,
  retirar,
  suspender,
  suspendidos,
} from '../../src/services/moderacionAdmin';

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
  it('llama al RPC con el id de la denuncia (no el del usuario)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await suspender('d1');
    expect(mockRpc).toHaveBeenCalledWith('moderar_suspender', { p_denuncia_id: 'd1' });
  });

  it('propaga el error de la RPC (p. ej. denuncia sin usuario para suspender)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'la denuncia no tiene un usuario para suspender' } });
    await expect(suspender('d1')).rejects.toMatchObject({ code: 'P0001' });
  });
});

// La otra mitad de suspender, que no existía: deshacerlo. Sin esto, una
// suspensión equivocada solo se arreglaba desde el SQL Editor de Supabase.
describe('suspendidos', () => {
  it('mapea las filas de la RPC (snake_case -> camelCase)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'u1', nombre: 'Bob', suspendido_en: '2026-07-29T10:00:00Z' }],
      error: null,
    });

    const filas = await suspendidos();

    expect(mockRpc).toHaveBeenCalledWith('moderacion_suspendidos');
    expect(filas).toEqual([
      { id: 'u1', nombre: 'Bob', suspendidoEn: '2026-07-29T10:00:00Z' },
    ]);
  });

  it('devuelve lista vacia cuando no hay ninguna suspendida', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(suspendidos()).resolves.toEqual([]);
  });

  it('propaga el error de la RPC', async () => {
    // Incluye el caso "la migración 0045 todavía no está aplicada"
    // (PGRST202: la firma no existe): la pantalla tiene que poder decirlo, no
    // mostrar una lista vacía que se lee como "no hay nadie suspendido".
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(suspendidos()).rejects.toMatchObject({ code: 'PGRST202' });
  });
});

describe('reactivar', () => {
  it('llama al RPC con el id del USUARIO (no el de una denuncia)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reactivar('u1');
    expect(mockRpc).toHaveBeenCalledWith('moderar_reactivar', { p_usuario_id: 'u1' });
  });

  it('propaga el error cuando la cuenta no estaba suspendida', async () => {
    // La RPC lanza en vez de no hacer nada. Si esto se tragara el error, el
    // panel diría "reactivada" sobre una cuenta que sigue suspendida.
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'la cuenta no esta suspendida' } });
    await expect(reactivar('u1')).rejects.toMatchObject({ code: 'P0001' });
  });
});
