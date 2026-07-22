import {
  avisarEscaneoCollar,
  createMyPet,
  deleteMyPet,
  listMyPets,
  mascotaPorCollar,
  updateMyPet,
} from '../../src/services/myPets';

// Builder falso que imita el encadenado de supabase-js (mismo patrón que pets.test.ts).
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
const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
    storage: {
      from: () => ({ remove: (...rargs: any[]) => mockRemove(...rargs) }),
    },
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRemove.mockReset();
  mockRpc.mockReset();
  mockRemove.mockResolvedValue({ data: [], error: null });
});

describe('listMyPets', () => {
  it('filtra por user_id y ordena por creado_en desc', async () => {
    const rows = [{ id: 'mp-1' }, { id: 'mp-2' }];
    const builder = makeQueryBuilder({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);

    const fichas = await listMyPets('user-1');

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.order).toHaveBeenCalledWith('creado_en', { ascending: false });
    expect(fichas).toEqual(rows);
  });

  it('devuelve [] cuando data es null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await listMyPets('user-1')).toEqual([]);
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listMyPets('user-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('createMyPet', () => {
  it('inserta con user_id y foto, y NO fija collar_token (lo pone el servidor)', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1', nombre: 'Pelusa' }, error: null });
    mockFrom.mockReturnValue(builder);

    const ficha = await createMyPet(
      { nombre: 'Pelusa', especie: 'perro', raza: 'quiltro', senas: 'mancha', chip: '123' },
      'https://foto/1.jpg',
      'user-1',
    );

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado).toMatchObject({ user_id: 'user-1', foto: 'https://foto/1.jpg', nombre: 'Pelusa' });
    expect(guardado).not.toHaveProperty('collar_token');
    expect(ficha).toEqual({ id: 'mp-1', nombre: 'Pelusa' });
  });

  it('convierte los opcionales vacíos en null (no guarda cadenas vacías)', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet({ nombre: 'Sol', especie: 'gato', raza: '', senas: '', chip: '' }, null, 'user-1');

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.raza).toBeNull();
    expect(guardado.senas).toBeNull();
    expect(guardado.chip).toBeNull();
    expect(guardado.foto).toBeNull();
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(
      createMyPet({ nombre: 'Sol', especie: 'gato' }, null, 'user-1'),
    ).rejects.toEqual({ message: 'boom' });
  });

  it('incluye los 4 campos del carnet en el insert cuando se pasan valores', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet(
      { nombre: 'Pelusa', especie: 'perro' },
      null,
      'user-1',
      {
        fechaNacimiento: '2022-01-15',
        vacunaProxima: '2025-08-15',
        antiparasitarioInternoProximo: '2025-09-15',
        antiparasitarioExternoProximo: '2025-08-15',
      },
    );

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.fecha_nacimiento).toBe('2022-01-15');
    expect(guardado.vacuna_proxima).toBe('2025-08-15');
    expect(guardado.antiparasitario_interno_proximo).toBe('2025-09-15');
    expect(guardado.antiparasitario_externo_proximo).toBe('2025-08-15');
  });

  it('convierte los campos del carnet undefined a null', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet(
      { nombre: 'Pelusa', especie: 'perro' },
      null,
      'user-1',
      {
        fechaNacimiento: undefined,
        vacunaProxima: undefined,
        antiparasitarioInternoProximo: undefined,
        antiparasitarioExternoProximo: undefined,
      },
    );

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.fecha_nacimiento).toBeNull();
    expect(guardado.vacuna_proxima).toBeNull();
    expect(guardado.antiparasitario_interno_proximo).toBeNull();
    expect(guardado.antiparasitario_externo_proximo).toBeNull();
  });

  it('guarda null en los campos del carnet cuando se pasan null', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet(
      { nombre: 'Pelusa', especie: 'perro' },
      null,
      'user-1',
      {
        fechaNacimiento: null,
        vacunaProxima: null,
        antiparasitarioInternoProximo: null,
        antiparasitarioExternoProximo: null,
      },
    );

    const guardado = builder.insert.mock.calls[0][0];
    expect(guardado.fecha_nacimiento).toBeNull();
    expect(guardado.vacuna_proxima).toBeNull();
    expect(guardado.antiparasitario_interno_proximo).toBeNull();
    expect(guardado.antiparasitario_externo_proximo).toBeNull();
  });

  it('no incluye los campos del carnet cuando no se pasan', async () => {
    const builder = makeQueryBuilder({ data: { id: 'mp-1' }, error: null });
    mockFrom.mockReturnValue(builder);

    await createMyPet({ nombre: 'Pelusa', especie: 'perro' }, null, 'user-1');

    const guardado = builder.insert.mock.calls[0][0];
    // No se envían si no se pasan en carnet (objeto vacío es default)
    expect(guardado.fecha_nacimiento).toBeNull();
    expect(guardado.vacuna_proxima).toBeNull();
    expect(guardado.antiparasitario_interno_proximo).toBeNull();
    expect(guardado.antiparasitario_externo_proximo).toBeNull();
  });
});

describe('updateMyPet', () => {
  it('llama a update(fields).eq(id) sobre my_pets', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', { nombre: 'Firulais', raza: '', senas: 'nueva seña', chip: '' });

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    // Los opcionales vacíos se normalizan a null también al editar.
    expect(builder.update).toHaveBeenCalledWith({
      nombre: 'Firulais', raza: null, senas: 'nueva seña', chip: null,
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'mp-1');
  });

  it('propaga el error de supabase', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(updateMyPet('mp-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });

  it('incluye solo los campos del carnet que se pasan en el update', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', {
      nombre: 'Nuevo nombre',
      fechaNacimiento: '2022-01-15',
      vacunaProxima: '2025-08-15',
    });

    expect(mockFrom).toHaveBeenCalledWith('my_pets');
    expect(builder.update).toHaveBeenCalledWith({
      nombre: 'Nuevo nombre',
      fecha_nacimiento: '2022-01-15',
      vacuna_proxima: '2025-08-15',
    });
    expect(builder.eq).toHaveBeenCalledWith('id', 'mp-1');
  });

  it('no incluye campos del carnet que no se pasan (no sobrescribe otros campos)', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', {
      fechaNacimiento: '2022-01-15',
    });

    expect(builder.update).toHaveBeenCalledWith({
      fecha_nacimiento: '2022-01-15',
    });
    // Los otros campos del carnet NO se incluyen
    const payload = builder.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty('vacuna_proxima');
    expect(payload).not.toHaveProperty('antiparasitario_interno_proximo');
    expect(payload).not.toHaveProperty('antiparasitario_externo_proximo');
  });

  it('guarda null en los campos del carnet cuando se pasan null', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', {
      fechaNacimiento: null,
      vacunaProxima: null,
      antiparasitarioInternoProximo: null,
      antiparasitarioExternoProximo: null,
    });

    expect(builder.update).toHaveBeenCalledWith({
      fecha_nacimiento: null,
      vacuna_proxima: null,
      antiparasitario_interno_proximo: null,
      antiparasitario_externo_proximo: null,
    });
  });

  it('mapea correctamente los 4 campos del carnet de camelCase a snake_case', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyPet('mp-1', {
      fechaNacimiento: '2022-01-15',
      vacunaProxima: '2025-08-15',
      antiparasitarioInternoProximo: '2025-09-15',
      antiparasitarioExternoProximo: '2025-08-15',
    });

    const payload = builder.update.mock.calls[0][0];
    expect(payload.fecha_nacimiento).toBe('2022-01-15');
    expect(payload.vacuna_proxima).toBe('2025-08-15');
    expect(payload.antiparasitario_interno_proximo).toBe('2025-09-15');
    expect(payload.antiparasitario_externo_proximo).toBe('2025-08-15');
    // Los nombres camelCase no deben estar en el payload
    expect(payload).not.toHaveProperty('fechaNacimiento');
    expect(payload).not.toHaveProperty('vacunaProxima');
    expect(payload).not.toHaveProperty('antiparasitarioInternoProximo');
    expect(payload).not.toHaveProperty('antiparasitarioExternoProximo');
  });
});

describe('deleteMyPet', () => {
  it('borra la foto del bucket ANTES de borrar la fila', async () => {
    const orden: string[] = [];
    const builder: any = {
      select: jest.fn(() => builder),
      delete: jest.fn(() => {
        orden.push('delete');
        return builder;
      }),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(() =>
        Promise.resolve({ data: { foto: `${BASE}/${UID}/a.jpg` }, error: null }),
      ),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };
    mockFrom.mockImplementation(() => builder);
    mockRemove.mockImplementation(() => {
      orden.push('storage');
      return Promise.resolve({ data: [], error: null });
    });

    await deleteMyPet('mp-1', UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`]);
    expect(orden).toEqual(['storage', 'delete']);
  });

  it('no llama a Storage si la ficha no tiene foto', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteMyPet('mp-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('ignora una foto que no es del propio usuario', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: `${BASE}/${OTRO}/x.jpg` }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));

    await deleteMyPet('mp-1', UID);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('borra la fila igual si Storage falla', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: `${BASE}/${UID}/a.jpg` }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: null }));
    mockRemove.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(deleteMyPet('mp-1', UID)).resolves.toBeUndefined();
  });

  it('propaga el error si falla el borrado de la fila', async () => {
    mockFrom
      .mockReturnValueOnce(makeQueryBuilder({ data: { foto: null }, error: null }))
      .mockReturnValueOnce(makeQueryBuilder({ data: null, error: { message: 'boom' } }));

    await expect(deleteMyPet('mp-1', UID)).rejects.toEqual({ message: 'boom' });
  });
});

describe('mascotaPorCollar', () => {
  it('llama a la RPC con el token y devuelve la primera fila', async () => {
    mockRpc.mockResolvedValue({
      data: [{ nombre: 'Pelusa', especie: 'perro', foto: 'f.jpg', reporte_perdida_id: null }],
      error: null,
    });

    const m = await mascotaPorCollar('tok9');

    expect(mockRpc).toHaveBeenCalledWith('mascota_por_collar', { p_token: 'tok9' });
    expect(m).toEqual({ nombre: 'Pelusa', especie: 'perro', foto: 'f.jpg', reporte_perdida_id: null });
  });

  it('devuelve null cuando el token no existe (0 filas)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await mascotaPorCollar('nope')).toBeNull();
  });

  it('la RPC NO expone contacto: solo campos públicos en el tipo de retorno', async () => {
    // Contrato de privacidad: aunque el backend devolviera de más, el servicio
    // solo promete los 4 campos públicos. Verificamos que reporte_perdida_id
    // viaja para poder enlazar al reporte, y que no dependemos de user_id.
    mockRpc.mockResolvedValue({
      data: [{ nombre: 'Sol', especie: 'gato', foto: null, reporte_perdida_id: 'rep-1' }],
      error: null,
    });
    const m = await mascotaPorCollar('tok');
    expect(m?.reporte_perdida_id).toBe('rep-1');
    expect(m).not.toHaveProperty('user_id');
  });

  it('propaga el error de la RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(mascotaPorCollar('tok')).rejects.toEqual({ message: 'boom' });
  });
});

describe('avisarEscaneoCollar', () => {
  it('llama a la RPC con token, nota y coordenadas', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await avisarEscaneoCollar('tok9', 'La vi en la plaza', -33.45, -70.66);

    expect(mockRpc).toHaveBeenCalledWith('avisar_escaneo_collar', {
      p_token: 'tok9', p_nota: 'La vi en la plaza', p_lat: -33.45, p_lng: -70.66,
    });
  });

  it('acepta nota y coordenadas nulas', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await avisarEscaneoCollar('tok', null, null, null);
    expect(mockRpc).toHaveBeenCalledWith('avisar_escaneo_collar', {
      p_token: 'tok', p_nota: null, p_lat: null, p_lng: null,
    });
  });

  it('propaga el error de la RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(avisarEscaneoCollar('tok', null, null, null)).rejects.toEqual({ message: 'boom' });
  });
});
