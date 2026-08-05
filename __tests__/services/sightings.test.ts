import { addSighting, listSightings, deleteSighting } from '../../src/services/sightings';

// Builder falso que imita el encadenado de supabase-js (select/insert/delete/
// eq/order son chainable y el resultado final es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();
// Sin sesion por defecto (mismo valor por defecto que produce `haySesion` si
// un test no la pisa): la mayoria de los tests de este archivo no le pega a
// la sesion y `getUser()` degradando a "sin usuario" no les cambia nada.
// Tipado `jest.Mock` (sin generics) a proposito: distintos tests le hacen
// `mockResolvedValue`/`mockRejectedValue` con formas de dato distintas
// (usuario null, usuario con id, rechazo), y un tipo inferido del primer
// `mockResolvedValue` (como haria `jest.fn(() => Promise.resolve(...))`) deja
// de aceptar las otras formas.
const mockGetUser: jest.Mock = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: { getUser: () => mockGetUser() },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

describe('addSighting', () => {
  it('inserta el avistamiento con nota/foto normalizadas y devuelve la fila', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-1', pet_id: 'pet-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const s = await addSighting({
      pet_id: 'pet-1',
      user_id: 'user-1',
      lat: -33.4,
      lng: -70.6,
      nota: 'Lo vi cruzando la plaza',
    });

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    // lat/lng se guardan difuminados (ver test dedicado más abajo), así que acá
    // solo comprobamos los campos que no cambian.
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pet_id: 'pet-1',
        user_id: 'user-1',
        nota: 'Lo vi cruzando la plaza',
        foto: null,
      }),
    );
    expect(s).toEqual({ id: 's-1', pet_id: 'pet-1' });
  });

  it('guarda la ubicacion difuminada, nunca la exacta', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addSighting({ pet_id: 'pet-1', user_id: 'u1', lat: -33.45, lng: -70.66 });

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.lat).not.toBe(-33.45);
    expect(guardado.lng).not.toBe(-70.66);
    expect(Math.abs(guardado.lat - (-33.45))).toBeLessThan(0.01);
  });

  it('convierte nota/foto ausentes en null', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-2' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addSighting({ pet_id: 'pet-1', user_id: 'user-1', lat: 0, lng: 0 });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nota: null, foto: null }),
    );
  });

  it('propaga el error de supabase (ej. RLS)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      addSighting({ pet_id: 'pet-1', user_id: 'user-1', lat: 0, lng: 0 }),
    ).rejects.toEqual({ message: 'boom' });
  });

  // yaDifuminado: true evita el doble difuminado cuando AddSightingScreen manda
  // una coordenada que ya vino difuminada de createPet (el pin sin mover).
  it('con yaDifuminado en true, guarda lat/lng tal cual, sin difuminar de nuevo', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addSighting({ pet_id: 'pet-1', user_id: 'u1', lat: -33.45, lng: -70.66, yaDifuminado: true });

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.lat).toBe(-33.45);
    expect(guardado.lng).toBe(-70.66);
  });

  it('sin yaDifuminado (o en false), difumina la coordenada como siempre', async () => {
    const builder = makeQueryBuilder({ data: { id: 's-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await addSighting({ pet_id: 'pet-1', user_id: 'u1', lat: -33.45, lng: -70.66, yaDifuminado: false });

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.lat).not.toBe(-33.45);
    expect(guardado.lng).not.toBe(-70.66);
  });
});

describe('listSightings', () => {
  it('filtra por pet_id y ordena por creado_en desc', async () => {
    const rows = [{ id: 's-1' }, { id: 's-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const list = await listSightings('pet-1');

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    expect(builder.eq).toHaveBeenCalledWith('pet_id', 'pet-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(list).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    expect(await listSightings('pet-1')).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listSightings('pet-1')).rejects.toEqual({ message: 'boom' });
  });

  // ── Columnas por sesion (finding de revision, migracion 0066) ───────────
  // Desde la 0066, `anon` solo tiene privilegio de columna sobre
  // `id, pet_id, lat, lng, nota, creado_en`. Un `select('*')` en ese camino
  // da 42501, no una fila con campos de mas: si `listSightings` alguna vez
  // volviera a pedir `*` sin sesion, este test lo agarra sin necesitar una
  // base real.
  it('sin sesion (anon, ej. PublicPetScreen), pide SOLO las columnas concedidas por la 0066', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await listSightings('pet-1');

    expect(builder.select).toHaveBeenCalledWith('id, pet_id, lat, lng, nota, creado_en');
    const columnas = builder.select.mock.calls[0][0] as string;
    expect(columnas).not.toMatch(/\*/);
    expect(columnas).not.toMatch(/\buser_id\b/);
    expect(columnas).not.toMatch(/\bfoto\b/);
  });

  it('con sesion (ej. PetDetailScreen), sigue pidiendo la fila completa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await listSightings('pet-1');

    expect(builder.select).toHaveBeenCalledWith('*');
  });

  it('si getUser() lanza (ej. un mock incompleto o la red caida), degrada a sin sesion en vez de propagar', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await expect(listSightings('pet-1')).resolves.toEqual([]);
    expect(builder.select).toHaveBeenCalledWith('id, pet_id, lat, lng, nota, creado_en');
  });
});

describe('deleteSighting', () => {
  it('llama a delete().eq(id) sobre la tabla sightings', async () => {
    // `data` con una fila, no `null`: desde el arreglo del borrado fantasma la
    // función exige que PostgREST confirme QUÉ borró, porque cuando la RLS
    // rechaza el delete no devuelve error, devuelve 0 filas. Ver
    // `__tests__/services/borrarAvistamientoFantasma.test.ts`.
    const builder = makeQueryBuilder({ data: [{ id: 's-1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await deleteSighting('s-1');

    expect(mockFrom).toHaveBeenCalledWith('sightings');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 's-1');
    expect(builder.select).toHaveBeenCalled();
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(deleteSighting('s-1')).rejects.toEqual({ message: 'boom' });
  });
});
