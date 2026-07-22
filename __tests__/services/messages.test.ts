import {
  foldConversations,
  listConversations,
  listMessages,
  markThreadRead,
  sendMessage,
} from '../../src/services/messages';

// Builder falso encadenable (select/or/order/in/eq/is/update/insert son
// chainable, el resultado final se resuelve al hacer `await`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    update: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    range: jest.fn(() => builder),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

// Builder que devuelve la tabla `messages` en PÁGINAS: cada `.range(desde, ...)`
// resuelve el trozo correspondiente de `todos`. Sirve para probar que
// `listConversations` recorre TODA la historia y no pierde hilos que quedan en
// páginas posteriores.
function makePagedMessagesBuilder(todos: any[], pagina: number) {
  const builder: any = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: jest.fn((desde: number, hasta: number) => ({
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: todos.slice(desde, hasta + 1), error: null }).then(resolve, reject),
    })),
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
        id: '2', pet_id: 'petA', adoption_id: null, from_user: 'me', to_user: 'otherU',
        texto: 'último mensaje', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
      {
        id: '1', pet_id: 'petA', adoption_id: null, from_user: 'otherU', to_user: 'me',
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
      ctx: { tipo: 'pet', id: 'petA' },
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
        id: '1', pet_id: 'petA', adoption_id: null, from_user: 'me', to_user: 'otherU',
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

  it('pagina la consulta (usa .range) en vez de traer todo sin cota', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await listConversations('me');

    // La primera página va de 0 a 999: la consulta está acotada, no es un
    // select sin límite que dependa del tope de filas del servidor.
    expect(messagesBuilder.range).toHaveBeenCalledWith(0, 999);
  });

  // El bug que el spec rechaza explícitamente: un `.limit(500)` (o depender del
  // tope de filas del servidor) corta por recencia de MENSAJE y haría
  // desaparecer un hilo viejo-pero-vivo que quedó debajo de mucho tráfico de
  // otro hilo. Acá el hilo B es el mensaje más viejo de todos y cae en la
  // SEGUNDA página: si `listConversations` no paginara, se perdería sin error.
  it('no pierde un hilo viejo-pero-vivo que cae en una página posterior', async () => {
    const PAGINA = 1000;
    const todos: any[] = [];
    // Página 1 llena: 1000 mensajes del hilo A (petA / otherU).
    for (let i = 0; i < PAGINA; i++) {
      todos.push({
        pet_id: 'petA', adoption_id: null, from_user: 'me', to_user: 'otherU',
        texto: `a${i}`, creado_en: `2026-07-16T10:00:${String(i % 60).padStart(2, '0')}Z`,
      });
    }
    // El más viejo de todos, en la página 2: hilo B (petB / otherV). Vivo, solo
    // que sepultado por el tráfico del hilo A.
    todos.push({
      pet_id: 'petB', adoption_id: null, from_user: 'otherV', to_user: 'me',
      texto: 'hola de B', creado_en: '2020-01-01T00:00:00Z',
    });

    const messagesBuilder = makePagedMessagesBuilder(todos, PAGINA);
    const profilesBuilder = makeQueryBuilder({
      data: [
        { id: 'otherU', nombre: 'Ana', eliminado_en: null },
        { id: 'otherV', nombre: 'Beto', eliminado_en: null },
      ],
      error: null,
    });
    const petsBuilder = makeQueryBuilder({
      data: [
        { id: 'petA', estado: 'perdida', especie: 'perro' },
        { id: 'petB', estado: 'encontrada', especie: 'gato' },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      if (table === 'pets') return petsBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('me');

    // Los dos hilos sobreviven: el activo (A) y el viejo-pero-vivo (B).
    expect(convs).toHaveLength(2);
    const hiloB = convs.find((c) => c.otherUser === 'otherV');
    expect(hiloB).toBeDefined();
    expect(hiloB?.lastTexto).toBe('hola de B');
    // Recorrió las dos páginas: [0,999] y [1000,1999].
    expect(messagesBuilder.range).toHaveBeenCalledWith(0, 999);
    expect(messagesBuilder.range).toHaveBeenCalledWith(1000, 1999);
  });
});

describe('listConversations con cuentas eliminadas', () => {
  it('marca el hilo como eliminado y lo nombra "Cuenta eliminada", sin tocar al usuario vivo', async () => {
    const msgs = [
      {
        id: '1', pet_id: 'petA', adoption_id: null, from_user: 'yo', to_user: 'fantasma',
        texto: 'hola', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
      {
        id: '2', pet_id: 'petA', adoption_id: null, from_user: 'yo', to_user: 'otherU',
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
describe('hilos sin reporte (pet_borrado)', () => {
  it('listConversations muestra "Reporte eliminado" y no consulta pets si todos los hilos son asi', async () => {
    const msgs = [
      {
        id: '1', pet_id: null, adoption_id: null, from_user: 'yo', to_user: 'otherU',
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
    expect(convs[0].ctx).toEqual({ tipo: 'pet_borrado' });
    expect(convs[0].petLabel).toBe('Reporte eliminado');
    // Sin reportes vivos que preguntarle a `pets`, no hay que consultarla.
    expect(mockFrom).not.toHaveBeenCalledWith('pets');
    // Tampoco hay adopciones que enriquecer.
    expect(mockFrom).not.toHaveBeenCalledWith('adoptions');
  });

  it('listMessages(pet_borrado) usa .is en pet_id Y adoption_id, para no matchear adopciones', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await listMessages({ tipo: 'pet_borrado' }, 'yo', 'otherU');

    // La TRAMPA: un reporte borrado tiene pet_id null, pero una adopción
    // también → hay que exigir los DOS null para no traer mensajes de adopción.
    expect(messagesBuilder.is).toHaveBeenCalledWith('pet_id', null);
    expect(messagesBuilder.is).toHaveBeenCalledWith('adoption_id', null);
    expect(messagesBuilder.eq).not.toHaveBeenCalledWith('pet_id', null);
  });

  it('markThreadRead(pet_borrado) usa .is en pet_id Y adoption_id', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await markThreadRead({ tipo: 'pet_borrado' }, 'yo', 'otherU');

    expect(messagesBuilder.is).toHaveBeenCalledWith('pet_id', null);
    expect(messagesBuilder.is).toHaveBeenCalledWith('adoption_id', null);
    expect(messagesBuilder.eq).not.toHaveBeenCalledWith('pet_id', null);
  });
});

// Tarea 6: generalización del chat a HiloCtx. El chat sirve tanto a reportes
// como a adopciones; el contexto del hilo es EXPLÍCITO para que un mensaje de
// adopción (pet_id null) no se confunda con uno de reporte borrado.
describe('refactor a HiloCtx (reportes + adopciones)', () => {
  it('foldConversations mantiene separados adopción, reporte y reporte-borrado entre las MISMAS dos personas', () => {
    // Mismas dos personas (yo ↔ vos), tres contextos distintos.
    const msgs = [
      {
        id: '3', pet_id: null, adoption_id: 'adoA', from_user: 'yo', to_user: 'vos',
        texto: 'sobre la adopción', leido: false, creado_en: '2026-07-16T12:00:00Z',
      },
      {
        id: '2', pet_id: 'petA', adoption_id: null, from_user: 'vos', to_user: 'yo',
        texto: 'sobre el reporte', leido: false, creado_en: '2026-07-16T11:00:00Z',
      },
      {
        id: '1', pet_id: null, adoption_id: null, from_user: 'yo', to_user: 'vos',
        texto: 'reporte ya borrado', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
    ];

    const convs = foldConversations(msgs as any, 'yo');

    // Tres claves distintas: NO se funden aunque sean las mismas dos personas.
    expect(convs).toHaveLength(3);
    const porTexto = (t: string) => convs.find((c) => c.lastTexto === t);
    expect(porTexto('sobre la adopción')?.ctx).toEqual({ tipo: 'adopcion', id: 'adoA' });
    expect(porTexto('sobre el reporte')?.ctx).toEqual({ tipo: 'pet', id: 'petA' });
    expect(porTexto('reporte ya borrado')?.ctx).toEqual({ tipo: 'pet_borrado' });
  });

  it('listMessages(adopcion) filtra por adoption_id, NO por pet_id null (la trampa)', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await listMessages({ tipo: 'adopcion', id: 'adoA' }, 'yo', 'otherU');

    expect(messagesBuilder.eq).toHaveBeenCalledWith('adoption_id', 'adoA');
    // Clave: NO cae en el branch de reporte-borrado (`.is('pet_id', null)`),
    // que le traería mensajes de reportes borrados por error.
    expect(messagesBuilder.is).not.toHaveBeenCalled();
  });

  it('listMessages(pet) filtra por pet_id', async () => {
    const messagesBuilder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await listMessages({ tipo: 'pet', id: 'petA' }, 'yo', 'otherU');

    expect(messagesBuilder.eq).toHaveBeenCalledWith('pet_id', 'petA');
    expect(messagesBuilder.is).not.toHaveBeenCalled();
  });

  it('sendMessage(adopcion) setea adoption_id y NO pet_id', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await sendMessage({ tipo: 'adopcion', id: 'adoA' }, 'yo', 'otherU', 'hola');

    expect(messagesBuilder.insert).toHaveBeenCalledWith({
      pet_id: null,
      adoption_id: 'adoA',
      from_user: 'yo',
      to_user: 'otherU',
      texto: 'hola',
      imagen_url: null,
    });
  });

  it('sendMessage(pet) setea pet_id y NO adoption_id', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await sendMessage({ tipo: 'pet', id: 'petA' }, 'yo', 'otherU', 'hola');

    expect(messagesBuilder.insert).toHaveBeenCalledWith({
      pet_id: 'petA',
      adoption_id: null,
      from_user: 'yo',
      to_user: 'otherU',
      texto: 'hola',
      imagen_url: null,
    });
  });

  it('markThreadRead(adopcion) filtra por adoption_id', async () => {
    const messagesBuilder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    await markThreadRead({ tipo: 'adopcion', id: 'adoA' }, 'yo', 'otherU');

    expect(messagesBuilder.eq).toHaveBeenCalledWith('adoption_id', 'adoA');
    expect(messagesBuilder.is).not.toHaveBeenCalled();
  });

  it('listConversations enriquece el label de una adopción consultando adoptions', async () => {
    const msgs = [
      {
        id: '1', pet_id: null, adoption_id: 'adoA', from_user: 'yo', to_user: 'otherU',
        texto: 'quiero conocerlo', leido: false, creado_en: '2026-07-16T10:00:00Z',
      },
    ];
    const messagesBuilder = makeQueryBuilder({ data: msgs, error: null });
    const profilesBuilder = makeQueryBuilder({ data: [{ id: 'otherU', nombre: 'Ana', eliminado_en: null }], error: null });
    const adoptionsBuilder = makeQueryBuilder({ data: [{ id: 'adoA', especie: 'perro', nombre: 'Pelusa' }], error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'messages') return messagesBuilder;
      if (table === 'profiles') return profilesBuilder;
      if (table === 'adoptions') return adoptionsBuilder;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const convs = await listConversations('yo');

    expect(convs).toHaveLength(1);
    expect(convs[0].ctx).toEqual({ tipo: 'adopcion', id: 'adoA' });
    expect(convs[0].petLabel).toBe('En adopción · Pelusa');
    expect(adoptionsBuilder.in).toHaveBeenCalledWith('id', ['adoA']);
    // Un hilo de adopción no debe disparar la consulta a `pets`.
    expect(mockFrom).not.toHaveBeenCalledWith('pets');
  });
});
