import { listConversations, listMessages, markThreadRead } from '../../src/services/messages';

// Builder falso encadenable (select/or/order/in/eq/is/update son chainable, el
// resultado final se resuelve al hacer `await`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    update: jest.fn(() => builder),
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

describe('listConversations', () => {
  it('devuelve [] cuando no hay mensajes', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('me');
    expect(convs).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('messages');
    // no debería consultar profiles/pets si no hay hilos
    expect(mockFrom).not.toHaveBeenCalledWith('profiles');
    expect(mockFrom).not.toHaveBeenCalledWith('pets');
  });

  it('arma la lista con el otro usuario y la mascota enriquecidos, deduplicando hilos', async () => {
    const msgs = [
      {
        id: '2', pet_id: 'petA', from_user: 'me', to_user: 'otherU',
        texto: 'último mensaje', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
      {
        id: '1', pet_id: 'petA', from_user: 'otherU', to_user: 'me',
        texto: 'mensaje viejo', leido: true, creado_en: '2026-07-16T09:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    const profilesBuilder = makeQueryBuilder({ data: [{ id: 'otherU', nombre: 'Ana' }], error: null });
    const petsBuilder = makeQueryBuilder({ data: [{ id: 'petA', estado: 'perdida', especie: 'perro' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      if (table === 'pets') return petsBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('me');

    // dedup: los dos mensajes son del mismo hilo (petA, otherU) → un solo resultado
    expect(convs).toHaveLength(1);
    expect(convs[0]).toEqual({
      petId: 'petA',
      otherUser: 'otherU',
      lastTexto: 'último mensaje',
      lastAt: '2026-07-16T10:00:00Z',
      otherNombre: 'Ana',
      otherEliminado: false,
      petLabel: 'perdida · perro',
    });
    expect(profilesBuilder.in).toHaveBeenCalledWith('id', ['otherU']);
    expect(petsBuilder.in).toHaveBeenCalledWith('id', ['petA']);
  });

  it('usa nombres genéricos cuando falta la data de enriquecimiento', async () => {
    const msgs = [
      {
        id: '1', pet_id: 'petA', from_user: 'me', to_user: 'otherU',
        texto: 'hola', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    const profilesBuilder = makeQueryBuilder({ data: [], error: null });
    const petsBuilder = makeQueryBuilder({ data: [], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      if (table === 'pets') return petsBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('me');
    expect(convs[0].otherNombre).toBe('Usuario');
    expect(convs[0].petLabel).toBe('Mascota');
  });

  it('propaga el error de supabase al consultar mensajes', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await expect(listConversations('me')).rejects.toEqual({ message: 'boom' });
  });
});

describe('listConversations con cuentas eliminadas', () => {
  it('marca el hilo como eliminado y lo nombra "Cuenta eliminada", sin tocar al usuario vivo', async () => {
    const msgs = [
      {
        id: '1', pet_id: 'petA', from_user: 'yo', to_user: 'fantasma',
        texto: 'hola', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
      {
        id: '2', pet_id: 'petA', from_user: 'yo', to_user: 'otherU',
        texto: 'hola de nuevo', leido: false, creado_en: '2026-07-16T11:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    // El fixture usa un nombre real y distinto de la etiqueta esperada, para
    // que el test pruebe que el nombre se pisa POR ESTAR ELIMINADA la cuenta
    // (via `eliminado_en`), no porque el mock ya trae el texto final. Con un
    // nombre real tambien se controla que una cuenta viva conserva su nombre.
    const profilesBuilder = makeQueryBuilder({
      data: [
        { id: 'fantasma', nombre: 'Roberto', eliminado_en: '2026-07-19T00:00:00Z' },
        { id: 'otherU', nombre: 'Ana', eliminado_en: null },
      ],
      error: null,
    });
    const petsBuilder = makeQueryBuilder({ data: [{ id: 'petA', estado: 'perdida', especie: 'perro' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      if (table === 'pets') return petsBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('yo');

    const hilo = convs.find((c) => c.otherUser === 'fantasma');
    expect(hilo?.otherNombre).toBe('Cuenta eliminada');
    expect(hilo?.otherEliminado).toBe(true);

    // Control: una cuenta viva con nombre real no debe pisarse.
    const hiloVivo = convs.find((c) => c.otherUser === 'otherU');
    expect(hiloVivo?.otherNombre).toBe('Ana');
    expect(hiloVivo?.otherEliminado).toBe(false);
  });
});

// Cubre la 0017: `messages.pet_id` pasa a nullable con `on delete set null`
// para que el hilo sobreviva al reporte (borrado de cuenta o borrado suelto
// del reporte). Estos tests verifican que el resto del código lo maneje bien.
describe('hilos sin reporte (pet_id null)', () => {
  it('listConversations muestra "Reporte eliminado" y no consulta pets si todos los hilos son asi', async () => {
    const msgs = [
      {
        id: '1', pet_id: null, from_user: 'yo', to_user: 'otherU',
        texto: 'hola', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    const profilesBuilder = makeQueryBuilder({ data: [{ id: 'otherU', nombre: 'Ana', eliminado_en: null }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('yo');

    expect(convs).toHaveLength(1);
    expect(convs[0].petId).toBeNull();
    expect(convs[0].petLabel).toBe('Reporte eliminado');
    // Sin reportes vivos que preguntarle a `pets`, no hay que consultarla.
    expect(mockFrom).not.toHaveBeenCalledWith('pets');
  });

  it('listMessages usa .is en vez de .eq para pet_id null, para que matchee NULL', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await listMessages(null, 'yo', 'otherU');

    expect(messagesBuilder.is).toHaveBeenCalledWith('pet_id', null);
    expect(messagesBuilder.eq).not.toHaveBeenCalledWith('pet_id', null);
  });

  it('markThreadRead usa .is en vez de .eq para pet_id null', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await markThreadRead(null, 'yo', 'otherU');

    expect(messagesBuilder.is).toHaveBeenCalledWith('pet_id', null);
    expect(messagesBuilder.eq).not.toHaveBeenCalledWith('pet_id', null);
  });
});
