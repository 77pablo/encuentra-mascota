import {
  createAdoption,
  getAdoption,
  getAdoptionsByIds,
  listMyAdoptions,
  updateAdoption,
  deleteAdoption,
  marcarAdoptada,
  renovarAdopcion,
  ADOPTION_NO_DISPONIBLE,
} from '../../src/services/adoptions';
import { ErrorAmigable } from '../../src/lib/dbErrors';

// Mismo builder falso que pets.test.ts: imita el encadenado de supabase-js
// (select/insert/update/delete/eq/order son chainable y el resultado final
// es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const UID = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://ywlrcfaybnikaurxsgtj.supabase.co/storage/v1/object/public/pet-photos';

const mockFrom = jest.fn();
const mockRemove = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: (...args: any[]) => ({ remove: (...rargs: any[]) => mockRemove(...rargs) }),
    },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRemove.mockReset();
  mockRemove.mockResolvedValue({ data: [], error: null });
});

describe('createAdoption', () => {
  it('inserta la publicación con user_id y fotos y devuelve la fila', async () => {
    const builder = makeQueryBuilder({ data: { id: 'ad-1', especie: 'perro' }, error: null });
    mockFrom.mockReturnValue(builder);

    const input = {
      especie: 'perro' as const,
      descripcion: 'busca familia',
      lat: -33.4,
      lng: -70.6,
    };
    const adoption = await createAdoption(input, ['https://foto/1.jpg'], 'user-1');

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', fotos: ['https://foto/1.jpg'], especie: 'perro' }),
    );
    expect(adoption).toEqual({ id: 'ad-1', especie: 'perro' });
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    const input = { especie: 'perro' as const, descripcion: 'x', lat: -33.4, lng: -70.6 };
    await expect(createAdoption(input, [], 'user-1')).rejects.toEqual({ message: 'boom' });
  });

  it('guarda la ubicación difuminada, nunca la exacta', async () => {
    const builder = makeQueryBuilder({ data: { id: 'ad-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const input = { especie: 'gato' as const, descripcion: 'x', lat: -33.45, lng: -70.66 };
    await createAdoption(input, ['f.jpg'], 'u1');

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.lat).not.toBe(-33.45);
    expect(guardado.lng).not.toBe(-70.66);
    // Movido, pero no a otro barrio.
    expect(Math.abs(guardado.lat - (-33.45))).toBeLessThan(0.01);
  });
});

describe('getAdoption', () => {
  it('devuelve la fila cuando existe', async () => {
    const builder = makeQueryBuilder({ data: { id: 'ad-1', especie: 'perro' }, error: null });
    mockFrom.mockReturnValue(builder);

    const adoption = await getAdoption('ad-1');

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(adoption).toEqual({ id: 'ad-1', especie: 'perro' });
  });

  it('lanza un mensaje humano si no existe (en vez del error crudo de PostgREST)', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await expect(getAdoption('no-existe')).rejects.toThrow(ADOPTION_NO_DISPONIBLE);
  });

  it('propaga el error de supabase cuando falla la consulta', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'network fail' } });
    mockFrom.mockReturnValue(builder);

    await expect(getAdoption('ad-1')).rejects.toEqual({ message: 'network fail' });
  });
});

describe('listMyAdoptions', () => {
  it('filtra por user_id y ordena por creado_en desc', async () => {
    const rows = [{ id: 'ad-1' }, { id: 'ad-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const adoptions = await listMyAdoptions('user-1');

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(adoptions).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const adoptions = await listMyAdoptions('user-1');
    expect(adoptions).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyAdoptions('user-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('getAdoptionsByIds', () => {
  it('trae las filas por id y ordena por creado_en desc', async () => {
    const rows = [{ id: 'ad-2' }, { id: 'ad-1' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const adoptions = await getAdoptionsByIds(['ad-1', 'ad-2']);

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.in).toHaveBeenCalledWith('id', ['ad-1', 'ad-2']);
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(adoptions).toEqual(rows);
  });

  it('no consulta la base si no hay ids', async () => {
    const adoptions = await getAdoptionsByIds([]);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(adoptions).toEqual([]);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const adoptions = await getAdoptionsByIds(['ad-1']);
    expect(adoptions).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(getAdoptionsByIds(['ad-1'])).rejects.toEqual({ message: 'boom' });
  });
});

describe('updateAdoption', () => {
  it('llama a update(fields).eq(id).select() sobre la tabla adoptions', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'ad-1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await updateAdoption('ad-1', { nombre: 'Pelusa' });

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Pelusa' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'ad-1');
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('permite editar fotos y comuna (campos editables extra del pulido)', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'ad-1' }], error: null });
    mockFrom.mockReturnValue(builder);

    await updateAdoption('ad-1', { fotos: ['f1.jpg'], comuna: 'Ñuñoa' });
    expect(builder.update).toHaveBeenCalledWith({ fotos: ['f1.jpg'], comuna: 'Ñuñoa' });
  });

  it('rechaza texto ofensivo (moderación) sin llamar a la base', async () => {
    await expect(
      updateAdoption('ad-1', { descripcion: 'vendo cachorros de raza pura' }),
    ).rejects.toThrow(/ventas de animales/i);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rechaza odio en requisitos sin llamar a la base', async () => {
    await expect(updateAdoption('ad-1', { requisitos: 'no aceptamos sudaca' })).rejects.toThrow(
      /ofensivos o discriminatorios/i,
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('0 filas devueltas (RLS rechazó) → error amigable', async () => {
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await expect(updateAdoption('ad-1', { nombre: 'x' })).rejects.toThrow(/no se pudo guardar/i);
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(updateAdoption('ad-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});

describe('deleteAdoption', () => {
  it('intenta borrar las fotos del bucket antes de borrar la fila', async () => {
    const fotos = [`${BASE}/${UID}/a.jpg`, `${BASE}/${UID}/b.jpg`];
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteAdoption('ad-1', UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`, `${UID}/b.jpg`]);
  });

  it('borra la fila igual si Storage falla (no aborta el borrado)', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${UID}/a.jpg`] }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockRemove.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(deleteAdoption('ad-1', UID)).resolves.toBeUndefined();
  });

  it('no llama a Storage si la publicación no tiene fotos', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [] }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteAdoption('ad-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('ignora las fotos que no son del propio usuario', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${OTRO}/x.jpg`] }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteAdoption('ad-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('lanza el error cuando falla el delete de la fila', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [] }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }));

    await expect(deleteAdoption('ad-1', UID)).rejects.toEqual({ message: 'boom' });
  });
});

describe('marcarAdoptada', () => {
  it('setea adoptada_en con la fecha actual', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const antes = Date.now();
    await marcarAdoptada('ad-1');
    const despues = Date.now();

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.eq).toHaveBeenCalledWith('id', 'ad-1');
    const campos = builder.update.mock.calls[0][0];
    expect(campos.adoptada_en).toBeDefined();
    const ts = new Date(campos.adoptada_en).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(despues);
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(marcarAdoptada('ad-1')).rejects.toEqual({ message: 'boom' });
  });
});

// CICLO DE VIDA DE ADOPCIÓN (migración 0052). Reactivar = "sigue buscando
// familia": reinicia el reloj de 90 días y la publicación vuelve al feed.
describe('renovarAdopcion', () => {
  it('pone renovado_en en ahora sobre la publicación indicada', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'ad-1' }], error: null });
    mockFrom.mockReturnValue(builder);

    const antes = Date.now();
    await renovarAdopcion('ad-1');
    const despues = Date.now();

    expect(mockFrom).toHaveBeenCalledWith('adoptions');
    expect(builder.eq).toHaveBeenCalledWith('id', 'ad-1');
    const ts = new Date(builder.update.mock.calls[0][0].renovado_en).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(despues);
  });

  it('no toca ninguna otra columna: reactivar no es editar', async () => {
    const builder = makeQueryBuilder({ data: [{ id: 'ad-1' }], error: null });
    mockFrom.mockReturnValue(builder);
    await renovarAdopcion('ad-1');
    expect(Object.keys(builder.update.mock.calls[0][0])).toEqual(['renovado_en']);
  });

  it('si la RLS rechaza el update (0 filas, sin error) NO dice "listo"', async () => {
    // PostgREST no devuelve error cuando la RLS filtra la fila: simplemente no
    // actualiza nada. Sin este chequeo la pantalla diría "ya está de vuelta" y
    // la publicación seguiría en pausa. Mismo criterio que `updateAdoption`.
    const builder = makeQueryBuilder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    await expect(renovarAdopcion('ad-1')).rejects.toBeInstanceOf(ErrorAmigable);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('con la 0052 sin aplicar dice que falta la actualización, no "no sos el dueño"', async () => {
    // PGRST204 = la columna `renovado_en` no está en el schema cache. Es el
    // caso real mientras la web ya está arriba y el SQL no se corrió: culpar al
    // usuario de no ser el dueño lo manda a buscar el problema donde no está.
    const builder = makeQueryBuilder({
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'renovado_en' column" },
    });
    mockFrom.mockReturnValue(builder);

    const e = await renovarAdopcion('ad-1').then(
      () => null,
      (err: any) => err,
    );
    expect(e).toBeInstanceOf(ErrorAmigable);
    expect(e.message).not.toMatch(/dueñ/i);
    expect(e.message).not.toMatch(/schema cache|renovado_en/i);
  });

  it('propaga cualquier otro error crudo', async () => {
    const builder = makeQueryBuilder({ data: null, error: { code: '08006', message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(renovarAdopcion('ad-1')).rejects.toEqual({ code: '08006', message: 'boom' });
  });
});
