import { getMyZone, setActivo, upsertMyZone } from '../../src/services/alertZones';

// Builder falso encadenable (mismo patrón que profile.test.ts). select/upsert/
// update/eq son chainable; el resultado final se resuelve al hacer `await`, o al
// llamar `.single()` / `.maybeSingle()`.
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
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

describe('getMyZone', () => {
  it('busca por user_id en alert_zones y devuelve la fila', async () => {
    const row = {
      user_id: 'u1',
      lat: -33.45,
      lng: -70.66,
      radio_km: 5,
      activo: true,
      actualizado_en: '2026-07-01T00:00:00Z',
    };
    const builder = makeQueryBuilder({ data: row, error: null });
    mockFrom.mockReturnValue(builder);

    const zone = await getMyZone('u1');

    expect(mockFrom).toHaveBeenCalledWith('alert_zones');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(zone).toEqual(row);
  });

  it('devuelve null cuando el usuario no tiene zona', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    expect(await getMyZone('u1')).toBeNull();
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(getMyZone('u1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('upsertMyZone', () => {
  it('hace upsert por user_id con los campos de la zona', async () => {
    const row = {
      user_id: 'u1',
      lat: -33.45,
      lng: -70.66,
      radio_km: 10,
      activo: true,
      actualizado_en: '2026-07-18T00:00:00Z',
    };
    const builder = makeQueryBuilder({ data: row, error: null });
    mockFrom.mockReturnValue(builder);

    const result = await upsertMyZone('u1', { lat: -33.45, lng: -70.66, radio_km: 10, activo: true });

    expect(mockFrom).toHaveBeenCalledWith('alert_zones');
    expect(builder.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = builder.upsert.mock.calls[0];
    expect(payload).toMatchObject({ user_id: 'u1', lat: -33.45, lng: -70.66, radio_km: 10, activo: true });
    expect(typeof payload.actualizado_en).toBe('string');
    expect(options).toEqual({ onConflict: 'user_id' });
    expect(result).toEqual(row);
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(
      upsertMyZone('u1', { lat: 0, lng: 0, radio_km: 5, activo: true }),
    ).rejects.toEqual({ message: 'boom' });
  });
});

describe('setActivo', () => {
  it('actualiza solo el flag activo filtrando por user_id', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await setActivo('u1', false);

    expect(mockFrom).toHaveBeenCalledWith('alert_zones');
    expect(builder.update).toHaveBeenCalledTimes(1);
    expect(builder.update.mock.calls[0][0]).toMatchObject({ activo: false });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(setActivo('u1', true)).rejects.toEqual({ message: 'boom' });
  });
});
