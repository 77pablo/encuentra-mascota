import {
  denunciarReporte,
  denunciarUsuario,
  denunciarMensaje,
  denunciarPista,
  denunciarAvistamiento,
  denunciarAdopcion,
  denunciarPregunta,
} from '../../src/services/moderation';

const mockInsert = jest.fn((..._args: any[]): any => Promise.resolve({ error: null }));
const mockFrom = jest.fn((..._args: any[]): any => ({ insert: mockInsert }));

jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

beforeEach(() => {
  mockInsert.mockReset();
  mockFrom.mockClear();
  mockInsert.mockResolvedValue({ error: null });
});

describe('cada denuncia inserta su tipo y objeto', () => {
  it('denunciarReporte → tipo reporte + pet_id', async () => {
    await denunciarReporte('pet1', 'yo', 'Spam');
    expect(mockFrom).toHaveBeenCalledWith('denuncias');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'reporte', pet_id: 'pet1', reporter_user: 'yo', motivo: 'Spam', detalle: null }),
    );
  });

  it('denunciarUsuario → tipo usuario + usuario_denunciado', async () => {
    await denunciarUsuario('otro', 'yo', 'Contenido ofensivo', '  me acosó  ');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'usuario', usuario_denunciado: 'otro', detalle: 'me acosó' }),
    );
  });

  it('denunciarMensaje → tipo mensaje + objeto_id', async () => {
    await denunciarMensaje('msg1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'mensaje', objeto_id: 'msg1' }));
  });

  it('denunciarPista → tipo pista + objeto_id', async () => {
    await denunciarPista('tip1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'pista', objeto_id: 'tip1' }));
  });

  it('denunciarAvistamiento → tipo avistamiento + objeto_id', async () => {
    await denunciarAvistamiento('s1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'avistamiento', objeto_id: 's1' }));
  });

  it('denunciarAdopcion → tipo adopcion + objeto_id', async () => {
    await denunciarAdopcion('ad1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'adopcion', objeto_id: 'ad1' }));
  });

  it('denunciarPregunta → tipo pregunta_adopcion + objeto_id + usuario_denunciado', async () => {
    await denunciarPregunta('preg1', 'autor1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'pregunta_adopcion',
        objeto_id: 'preg1',
        usuario_denunciado: 'autor1',
        reporter_user: 'yo',
        motivo: 'Spam',
      }),
    );
  });
});

describe('duplicado y errores', () => {
  it('traduce el 23505 a un mensaje amable', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505' } });
    await expect(denunciarUsuario('otro', 'yo', 'Spam')).rejects.toThrow(/ya denunciaste/i);
  });

  it('propaga otros errores tal cual', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42501' } });
    await expect(denunciarUsuario('otro', 'yo', 'Spam')).rejects.toEqual({ code: '42501' });
  });
});

describe('escalón de compatibilidad de denunciarReporte', () => {
  it('reintenta con la forma histórica si faltan las columnas de la pieza 2', async () => {
    mockInsert
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column "tipo" does not exist' } })
      .mockResolvedValueOnce({ error: null });
    await denunciarReporte('pet1', 'yo', 'Spam');
    expect(mockInsert).toHaveBeenCalledTimes(2);
    // El reintento usa solo las columnas históricas (sin tipo/detalle).
    expect(mockInsert).toHaveBeenLastCalledWith({ pet_id: 'pet1', reporter_user: 'yo', motivo: 'Spam' });
  });

  it('no reintenta cuando el error no es de columna faltante', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42501' } });
    await expect(denunciarReporte('pet1', 'yo', 'Spam')).rejects.toEqual({ code: '42501' });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
