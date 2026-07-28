import { countUnread, listConversations } from '../../src/services/messages';
import { listUpdates } from '../../src/services/petUpdates';

// FILTRO DE BLOQUEADOS EN LAS LISTAS DEL CLIENTE.
//
// Pistas y avistamientos ya lo hacian (tips.ts / sightings.ts). Faltaban las
// CONVERSACIONES (el hilo de alguien que bloqueaste seguia en la bandeja, con su
// nombre y su ultimo mensaje) y las NOVEDADES de un reporte.
//
// Es un filtro cosmetico a proposito: el control de acceso real es la RLS de la
// 0022. Lo que se prueba aca es que el filtro este puesto y que degrade a "no
// filtrar" en vez de romper cuando no hay sesion o la tabla no existe.

const mockIdsBloqueados = jest.fn();

jest.mock('../../src/services/bloqueos', () => ({
  ...jest.requireActual('../../src/services/bloqueos'),
  idsBloqueados: (...args: any[]) => mockIdsBloqueados(...args),
}));

function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    or: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    not: jest.fn(() => builder),
    range: jest.fn(() => builder),
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
  mockIdsBloqueados.mockReset();
  mockIdsBloqueados.mockResolvedValue(new Set());
});

// Dos hilos: uno con `bloqueada` y otro con `ana`.
const MSGS = [
  {
    id: '2', pet_id: 'petA', adoption_id: null, from_user: 'me', to_user: 'ana',
    texto: 'hola ana', leido: false, creado_en: '2026-07-16T10:00:00Z',
  },
  {
    id: '1', pet_id: 'petB', adoption_id: null, from_user: 'bloqueada', to_user: 'me',
    texto: 'dame plata', leido: false, creado_en: '2026-07-16T09:00:00Z',
  },
];

function montarTablas() {
  const messagesBuilder = makeQueryBuilder({ data: MSGS, error: null });
  const profilesBuilder = makeQueryBuilder({
    data: [{ id: 'ana', nombre: 'Ana' }, { id: 'bloqueada', nombre: 'Quien Sea' }],
    error: null,
  });
  const petsBuilder = makeQueryBuilder({
    data: [
      { id: 'petA', estado: 'perdida', especie: 'perro' },
      { id: 'petB', estado: 'perdida', especie: 'gato' },
    ],
    error: null,
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'messages') return messagesBuilder;
    if (table === 'profiles') return profilesBuilder;
    if (table === 'pets') return petsBuilder;
    throw new Error(`tabla inesperada: ${table}`);
  });
  return { messagesBuilder, profilesBuilder, petsBuilder };
}

describe('listConversations esconde los hilos de gente que bloquee', () => {
  it('saca el hilo de la persona bloqueada y deja el resto', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['bloqueada']));
    montarTablas();
    const convs = await listConversations('me');
    expect(convs.map((c) => c.otherUser)).toEqual(['ana']);
  });

  it('no gasta el viaje de red del enriquecido por un hilo que va a esconder', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['bloqueada']));
    const { profilesBuilder, petsBuilder } = montarTablas();
    await listConversations('me');
    expect(profilesBuilder.in).toHaveBeenCalledWith('id', ['ana']);
    expect(petsBuilder.in).toHaveBeenCalledWith('id', ['petA']);
  });

  it('sin bloqueos devuelve los dos hilos (no filtra de mas)', async () => {
    montarTablas();
    const convs = await listConversations('me');
    expect(convs.map((c) => c.otherUser).sort()).toEqual(['ana', 'bloqueada']);
  });

  it('si TODOS los hilos son de bloqueados devuelve [] sin consultar perfiles', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['ana', 'bloqueada']));
    montarTablas();
    const convs = await listConversations('me');
    expect(convs).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith('profiles');
  });
});

describe('countUnread no deja un globito imposible de apagar', () => {
  it('excluye del conteo los mensajes de gente bloqueada', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['bloqueada']));
    const builder = makeQueryBuilder({ data: null, error: null });
    (builder as any).then = (resolve: any) => Promise.resolve({ count: 3, error: null }).then(resolve);
    mockFrom.mockImplementation(() => builder);

    await countUnread('me');
    expect(builder.not).toHaveBeenCalledWith('from_user', 'in', '(bloqueada)');
  });

  it('sin bloqueos no agrega ningun filtro extra', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    (builder as any).then = (resolve: any) => Promise.resolve({ count: 7, error: null }).then(resolve);
    mockFrom.mockImplementation(() => builder);

    await expect(countUnread('me')).resolves.toBe(7);
    expect(builder.not).not.toHaveBeenCalled();
  });
});

describe('listUpdates esconde las novedades de gente que bloquee', () => {
  const filas = [
    { id: 'u2', pet_id: 'petA', user_id: 'bloqueada', texto: 'algo', creado_en: '2026-07-16T11:00:00Z' },
    { id: 'u1', pet_id: 'petA', user_id: 'dueno', texto: 'sigo buscando', creado_en: '2026-07-16T10:00:00Z' },
  ];

  it('filtra por autor de la novedad', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['bloqueada']));
    mockFrom.mockImplementation(() => makeQueryBuilder({ data: filas, error: null }));
    const res = await listUpdates('petA');
    expect(res.map((u) => u.id)).toEqual(['u1']);
  });

  it('sin bloqueos devuelve todo tal cual', async () => {
    mockFrom.mockImplementation(() => makeQueryBuilder({ data: filas, error: null }));
    const res = await listUpdates('petA');
    expect(res).toEqual(filas);
  });

  it('sigue propagando el error de la consulta (el filtro no lo tapa)', async () => {
    mockIdsBloqueados.mockResolvedValue(new Set(['bloqueada']));
    mockFrom.mockImplementation(() => makeQueryBuilder({ data: null, error: { message: 'boom' } }));
    await expect(listUpdates('petA')).rejects.toEqual({ message: 'boom' });
  });
});
