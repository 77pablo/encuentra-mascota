import { listConversations } from '../../src/services/messages';

// Builder falso encadenable (select/or/order/in son chainable, el resultado
// final se resuelve al hacer `await`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
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
  it('marca el hilo como eliminado y lo nombra "Cuenta eliminada"', async () => {
    const msgs = [
      {
        id: '1', pet_id: 'petA', from_user: 'yo', to_user: 'fantasma',
        texto: 'hola', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    const profilesBuilder = makeQueryBuilder({
      data: [{ id: 'fantasma', nombre: 'Cuenta eliminada', eliminado_en: '2026-07-19T00:00:00Z' }],
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
  });
});
