import {
  createPet,
  deletePet,
  listLostBySpecies,
  listMyReports,
  updatePet,
} from '../../src/services/pets';

// Builder falso que imita el encadenado de supabase-js (select/insert/update/
// delete/eq/order son chainable y el resultado final es "await-able").
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => builder),
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
// El bucket privado de fotos anónimas (D4/D5, 0062) necesita su propio mock
// de `list`/`remove`, distinto del de `pet-photos`: se resuelve por el nombre
// del bucket para no mezclar sus asserts con los de arriba.
const mockStorageFrom = jest.fn();
const mockAnonimasList = jest.fn();
const mockAnonimasRemove = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: (...args: any[]) => {
        mockStorageFrom(...args);
        if (args[0] === 'avisos-anonimos') {
          return {
            list: (...largs: any[]) => mockAnonimasList(...largs),
            remove: (...rargs: any[]) => mockAnonimasRemove(...rargs),
          };
        }
        return { remove: (...rargs: any[]) => mockRemove(...rargs) };
      },
    },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRemove.mockReset();
  mockRemove.mockResolvedValue({ data: [], error: null });
  mockStorageFrom.mockReset();
  mockAnonimasList.mockReset();
  mockAnonimasList.mockResolvedValue({ data: [], error: null });
  mockAnonimasRemove.mockReset();
  mockAnonimasRemove.mockResolvedValue({ data: [], error: null });
});

describe('createPet', () => {
  it('inserta el reporte con user_id y fotos y devuelve la fila', async () => {
    const builder = makeQueryBuilder({ data: { id: 'pet-1', estado: 'perdida' }, error: null });
    mockFrom.mockReturnValue(builder);

    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    const pet = await createPet(input, ['https://foto/1.jpg'], 'user-1');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', fotos: ['https://foto/1.jpg'], estado: 'perdida' }),
    );
    expect(pet).toEqual({ id: 'pet-1', estado: 'perdida' });
  });

  it('propaga el error de supabase (ej. límite anti-spam)', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'Alcanzaste el límite de publicaciones por ahora. Intenta de nuevo en un rato.' } });
    mockFrom.mockReturnValue(builder);

    const input = {
      estado: 'perdida' as const, especie: 'perro' as const,
      descripcion: 'café', lat: -33.4, lng: -70.6,
    };
    await expect(createPet(input, [], 'user-1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('límite de publicaciones') }),
    );
  });

  it('guarda la ubicacion difuminada, nunca la exacta', async () => {
    const builder = makeQueryBuilder({ data: { id: 'p1' }, error: null });
    mockFrom.mockReturnValue(builder);

    const input = { lat: -33.45, lng: -70.66, especie: 'perro', estado: 'perdido' } as any;
    await createPet(input, ['f.jpg'], 'u1');

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.lat).not.toBe(-33.45);
    expect(guardado.lng).not.toBe(-70.66);
    // Movido, pero no a otro barrio: el reporte tiene que seguir siendo util.
    expect(Math.abs(guardado.lat - (-33.45))).toBeLessThan(0.01);
  });
});

describe('updatePet', () => {
  it('llama a update(fields).eq(id) sobre la tabla pets', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updatePet('pet-1', { nombre: 'Firulais' });

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Firulais' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'pet-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(updatePet('pet-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});

describe('deletePet', () => {
  it('llama a delete().eq(id) sobre la tabla pets', async () => {
    // Misma fila para el select (lectura de fotos) y para el delete: sin fotos,
    // así que Storage ni se llama.
    const builder = makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null });
    mockFrom.mockReturnValue(builder);

    await deletePet('pet-1', UID);

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'pet-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }));

    await expect(deletePet('pet-1', UID)).rejects.toEqual({ message: 'boom' });
  });

  it('borra las fotos ANTES de borrar la fila, incluida final_foto', async () => {
    const fotos = [`${BASE}/${UID}/a.jpg`, `${BASE}/${UID}/b.jpg`];
    // 1a llamada: el select que lee las rutas. 2a: el delete de la fila.
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos, final_foto: `${BASE}/${UID}/c.jpg` }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('p1', UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`, `${UID}/b.jpg`, `${UID}/c.jpg`]);
  });

  // La lección literal del Critical #2 del borrado de cuenta: si la fila se
  // borra primero, las rutas se pierden y no hay reintento posible. Este test
  // no confía en el orden de las promesas: registra en `orden` el momento
  // EXACTO en que el código invoca cada operación (el `delete()` síncrono que
  // arma la query, y el `remove()` de Storage), así que si alguien invierte el
  // orden real de las llamadas en `deletePet`, el array queda
  // ['delete', 'storage'] y el `toEqual` de abajo falla.
  it('lee las rutas antes de destruir la fila', async () => {
    const orden: string[] = [];
    const builder: any = {
      select: jest.fn(() => builder),
      delete: jest.fn(() => {
        orden.push('delete');
        return builder;
      }),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: { fotos: [`${BASE}/${UID}/a.jpg`], final_foto: null }, error: null }),
      ),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };
    mockFrom.mockImplementation(() => builder);
    mockRemove.mockImplementation(() => {
      orden.push('storage');
      return Promise.resolve({ data: [], error: null });
    });

    await deletePet('p1', UID);

    expect(orden).toEqual(['storage', 'delete']);
  });

  // Se elige el estado malo VISIBLE por sobre el silencioso: si abortáramos, un
  // hipo de Storage dejaría a la persona sin poder borrar su propio reporte,
  // que puede ser justo una urgencia de privacidad.
  it('borra la fila igual si Storage falla', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${UID}/a.jpg`], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockRemove.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(deletePet('p1', UID)).resolves.toBeUndefined();
  });

  it('no llama a Storage si el reporte no tiene fotos', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('p1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('ignora las fotos que no son del propio usuario', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${OTRO}/x.jpg`], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('p1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  // Mismo criterio que `delete-account/index.ts:126-133`: si el filtro
  // descartó TODAS las URLs que había, alguien tiene que enterarse, porque
  // puede ser un cambio de formato de `getPublicUrl` o una URL ajena guardada
  // a mano — no simplemente "no había fotos".
  it('avisa si el filtro descarta todas las fotos en vez de fallar en silencio', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [`${BASE}/${OTRO}/x.jpg`], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('p1', UID);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('p1'));
    warn.mockRestore();
  });

  // El `select` que lee las rutas puede fallar (red, etc.) igual que
  // cualquier otra consulta. Si eso pasa en silencio, la fila se borra sin
  // haber tocado ninguna foto y la app le dice "Borrado" a la persona.
  it('avisa si no se pudieron leer las fotos antes de borrar, y borra la fila igual', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'network fail' } }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await expect(deletePet('p1', UID)).resolves.toBeUndefined();

    expect(mockRemove).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toEqual(expect.stringContaining('network fail'));
    warn.mockRestore();
  });

  // Hermano de la deduplicación que ya hace `delete-account/index.ts:136`
  // (por si `final_foto` también está dentro de `fotos`).
  it('deduplica rutas repetidas (ej. final_foto que también está en fotos)', async () => {
    const url = `${BASE}/${UID}/a.jpg`;
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [url], final_foto: url }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('p1', UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`]);
  });
});

// D5: borrar un reporte también vacía la carpeta de fotos anónimas del
// bucket privado `avisos-anonimos` (D4, 0062), organizada por `<pet_id>/...`.
//
// OJO CON EL SILENCIO DE POSTGREST/STORAGE: `list()` y `remove()` no lanzan
// sobre un error de la base, contestan `{ data: null, error }` como cualquier
// otra llamada de Supabase — igual que el `remove` de `pet-photos` unas
// líneas arriba. Un `try/catch` solo (como en el borrado de `pet-photos`,
// que tampoco usa uno) no alcanzaría para agarrar ese caso, así que estos
// tests verifican el campo `error`, no una excepción.
describe('deletePet — carpeta de fotos anónimas (D4/D5, 0062)', () => {
  it('borrar el reporte también vacía su carpeta de fotos anónimas', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('pet-1', 'user-1');

    expect(mockStorageFrom).toHaveBeenCalledWith('avisos-anonimos');
  });

  it('lista la carpeta por pet_id y borra cada archivo con su path completo', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockAnonimasList.mockResolvedValueOnce({
      data: [{ name: 'a.jpg' }, { name: 'b.jpg' }],
      error: null,
    });

    await deletePet('pet-1', 'user-1');

    // Paginado (D3): pide bucket + prefijo + `{ limit: 100, offset: 0 }` en la
    // primera vuelta, no un `list(prefijo)` pelado.
    expect(mockAnonimasList).toHaveBeenCalledWith('pet-1', { limit: 100, offset: 0 });
    expect(mockAnonimasRemove).toHaveBeenCalledWith(['pet-1/a.jpg', 'pet-1/b.jpg']);
  });

  it('carpeta vacía: no llama a remove', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('pet-1', 'user-1');

    expect(mockAnonimasRemove).not.toHaveBeenCalled();
  });

  // Integración real del paginado (D3): más de 100 fotos anónimas ya no dejan
  // huérfanas las que exceden la primera página.
  it('con más de 100 fotos anónimas, pagina y borra TODAS, no solo las primeras 100', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    const pagina = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `f${i}.jpg` }));
    mockAnonimasList
      .mockResolvedValueOnce({ data: pagina(100), error: null })
      .mockResolvedValueOnce({ data: pagina(30), error: null });

    await deletePet('pet-1', 'user-1');

    expect(mockAnonimasList).toHaveBeenCalledTimes(2);
    expect(mockAnonimasList).toHaveBeenNthCalledWith(2, 'pet-1', { limit: 100, offset: 100 });
    const rutasBorradas = mockAnonimasRemove.mock.calls[0][0];
    expect(rutasBorradas).toHaveLength(130);
  });

  it('si listar la carpeta falla (sin excepción, como responde Storage), avisa y borra la fila igual', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockAnonimasList.mockResolvedValueOnce({ data: null, error: { message: 'boom anonimas' } });

    await expect(deletePet('pet-1', 'user-1')).resolves.toBeUndefined();

    expect(mockAnonimasRemove).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toEqual(expect.stringContaining('boom anonimas'));
    warn.mockRestore();
  });

  it('si borrar la carpeta falla, avisa y borra la fila igual', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { fotos: [], final_foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockAnonimasList.mockResolvedValueOnce({ data: [{ name: 'a.jpg' }], error: null });
    mockAnonimasRemove.mockResolvedValueOnce({ data: null, error: { message: 'no se pudo borrar' } });

    await expect(deletePet('pet-1', 'user-1')).resolves.toBeUndefined();

    expect(warn.mock.calls.flat().join(' ')).toEqual(expect.stringContaining('no se pudo borrar'));
    warn.mockRestore();
  });

  it('pasa por la carpeta anónima incluso cuando el reporte no tiene fotos propias', async () => {
    // No depende de `fotos`/`final_foto`: la carpeta anónima es independiente
    // de si el dueño subió fotos al publicar.
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deletePet('pet-1', 'user-1');

    expect(mockAnonimasList).toHaveBeenCalledWith('pet-1', { limit: 100, offset: 0 });
  });
});

describe('listLostBySpecies', () => {
  it('filtra activo=true, estado=perdida, especie=X y ordena por creado_en desc', async () => {
    const rows = [{ id: 'pet-1' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listLostBySpecies('perro');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'activo', true);
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'estado', 'perdida');
    expect(builder.eq).toHaveBeenNthCalledWith(3, 'especie', 'perro');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(pets).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listLostBySpecies('gato');
    expect(pets).toEqual([]);
  });
});

describe('listMyReports', () => {
  it('filtra por user_id y activo, y ordena por creado_en desc', async () => {
    const rows = [{ id: 'pet-1' }, { id: 'pet-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const pets = await listMyReports('user-1', true);

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'activo', true);
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(pets).toEqual(rows);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(listMyReports('user-1', false)).rejects.toEqual({ message: 'boom' });
  });
});
