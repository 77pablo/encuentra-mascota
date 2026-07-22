import {
  listQuestions,
  askQuestion,
  answerQuestion,
  deleteQuestion,
} from '../../src/services/adoptionQuestions';

// Mismo builder falso que adoptions.test.ts/tips.test.ts: imita el encadenado
// de supabase-js (select/insert/update/delete/eq/order son chainable y el
// resultado final es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('listQuestions', () => {
  it('trae las preguntas con la firma del autor y ordena por creado_en desc', async () => {
    const filas = [
      {
        id: 'q1',
        adoption_id: 'ad-1',
        user_id: 'u1',
        pregunta: '¿Se lleva bien con gatos?',
        respuesta: null,
        creado_en: '2026-07-20T10:00:00Z',
        respondido_en: null,
        profiles: { nombre: 'Vero', eliminado_en: null },
      },
    ];
    const builder = makeQueryBuilder({ data: filas, error: null });
    mockFrom.mockReturnValue(builder);

    const preguntas = await listQuestions('ad-1');

    expect(mockFrom).toHaveBeenCalledWith('adoption_questions');
    expect(builder.eq).toHaveBeenCalledWith('adoption_id', 'ad-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(preguntas).toEqual([
      {
        id: 'q1',
        adoptionId: 'ad-1',
        userId: 'u1',
        pregunta: '¿Se lleva bien con gatos?',
        respuesta: null,
        creadoEn: '2026-07-20T10:00:00Z',
        respondidoEn: null,
        autorNombre: 'Vero',
        autorEliminadoEn: null,
      },
    ]);
  });

  it('cuentas borradas: autorEliminadoEn viene con fecha', async () => {
    const filas = [
      {
        id: 'q1', adoption_id: 'ad-1', user_id: 'u1', pregunta: 'hola', respuesta: null,
        creado_en: '2026-07-20T10:00:00Z', respondido_en: null,
        profiles: { nombre: null, eliminado_en: '2026-07-01T00:00:00Z' },
      },
    ];
    mockFrom.mockReturnValue(makeQueryBuilder({ data: filas, error: null }));
    const [p] = await listQuestions('ad-1');
    expect(p.autorEliminadoEn).toBe('2026-07-01T00:00:00Z');
  });

  it('degrada a la consulta sin autor si el embed a profiles falla', async () => {
    const filas = [
      { id: 'q1', adoption_id: 'ad-1', user_id: 'u1', pregunta: 'hola', respuesta: null, creado_en: 't', respondido_en: null },
    ];
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }))
      .mockReturnValueOnce(makeQueryBuilder({ data: filas, error: null }));

    const preguntas = await listQuestions('ad-1');
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0].autorNombre).toBeNull();
  });

  it('devuelve [] si las dos consultas fallan (no rompe la pantalla)', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom2' } }));

    const preguntas = await listQuestions('ad-1');
    expect(preguntas).toEqual([]);
  });
});

describe('askQuestion', () => {
  it('inserta la pregunta a nombre de la sesión y devuelve la fila creada', async () => {
    const builder = makeQueryBuilder({
      data: { id: 'q1', adoption_id: 'ad-1', user_id: 'user-1', pregunta: '¿Come pienso?', respuesta: null, creado_en: 't', respondido_en: null },
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const q = await askQuestion('ad-1', '¿Come pienso?');

    expect(mockFrom).toHaveBeenCalledWith('adoption_questions');
    expect(builder.insert).toHaveBeenCalledWith({
      adoption_id: 'ad-1',
      user_id: 'user-1',
      pregunta: '¿Come pienso?',
    });
    expect(q.id).toBe('q1');
  });

  it('recorta espacios en blanco antes de guardar', async () => {
    const builder = makeQueryBuilder({ data: { id: 'q1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await askQuestion('ad-1', '   ¿hola?   ');
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ pregunta: '¿hola?' }));
  });

  it('rechaza una pregunta vacía sin llamar a la base', async () => {
    await expect(askQuestion('ad-1', '   ')).rejects.toThrow(/escribí tu pregunta/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rechaza texto ofensivo (moderación) sin llamar a la base', async () => {
    await expect(askQuestion('ad-1', 'ojalá se lo lleve un maricón de mierda')).rejects.toThrow(
      /ofensivos o discriminatorios/i,
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sin sesión, lanza un mensaje amigable sin llamar a la base', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(askQuestion('ad-1', '¿hola?')).rejects.toThrow(/sesión abierta/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(askQuestion('ad-1', '¿hola?')).rejects.toEqual({ message: 'boom' });
  });
});

describe('answerQuestion', () => {
  it('actualiza respuesta y respondido_en', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'q1' }], error: null });
    mockFrom.mockReturnValue(builder);

    const antes = Date.now();
    await answerQuestion('q1', 'Sí, se lleva bien');
    const despues = Date.now();

    expect(builder.update).toHaveBeenCalled();
    const campos = builder.update.mock.calls[0][0];
    expect(campos.respuesta).toBe('Sí, se lleva bien');
    const ts = new Date(campos.respondido_en).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(despues);
    expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
  });

  it('rechaza una respuesta vacía sin llamar a la base', async () => {
    await expect(answerQuestion('q1', '  ')).rejects.toThrow(/escribí una respuesta/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rechaza texto ofensivo (moderación) sin llamar a la base', async () => {
    await expect(answerQuestion('q1', 'vendo cachorros de raza pura')).rejects.toThrow(/ventas de animales/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('0 filas devueltas (RLS rechazó) → error amigable', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(answerQuestion('q1', 'Sí')).rejects.toThrow(/no se pudo responder/i);
  });

  it('propaga el error de supabase', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'boom' } }));
    await expect(answerQuestion('q1', 'Sí')).rejects.toEqual({ message: 'boom' });
  });
});

describe('deleteQuestion', () => {
  it('borra la pregunta cuando la RLS lo permite', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'q1' }], error: null });
    mockFrom.mockReturnValue(builder);
    await expect(deleteQuestion('q1')).resolves.toBeUndefined();
    expect(builder.eq).toHaveBeenCalledWith('id', 'q1');
  });

  it('0 filas devueltas (RLS rechazó) → error amigable', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: [], error: null }));
    await expect(deleteQuestion('q1')).rejects.toThrow(/no se pudo borrar/i);
  });

  it('propaga el error de supabase', async () => {
    mockFrom.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'boom' } }));
    await expect(deleteQuestion('q1')).rejects.toEqual({ message: 'boom' });
  });
});
