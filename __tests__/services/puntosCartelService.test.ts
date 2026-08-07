import { buscarPuntosCartel } from '../../src/services/puntosCartel';

describe('buscarPuntosCartel', () => {
  const centro = { lat: -33.45, lng: -70.66 };
  const okJson = {
    elements: [
      { type: 'node', id: 1, lat: -33.4505, lon: -70.6605 },
      { type: 'node', id: 2, lat: -33.451, lon: -70.661 },
    ],
  };

  afterEach(() => {
    (global as any).fetch = undefined;
  });

  it('hace la consulta a Overpass y devuelve los puntos parseados', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => okJson,
    });
    (global as any).fetch = fetchMock;

    const r = await buscarPuntosCartel(centro.lat, centro.lng, 800);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('overpass-api.de');
    expect(r.length).toBe(2);
    expect(r[0].distanciaM).toBeLessThanOrEqual(r[1].distanciaM);
  });

  it('lanza si Overpass responde no-ok (el componente cae al consejo genérico)', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 504 });
    await expect(buscarPuntosCartel(centro.lat, centro.lng, 800)).rejects.toThrow();
  });

  it('lanza si el fetch falla (red caída)', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
    await expect(buscarPuntosCartel(centro.lat, centro.lng, 800)).rejects.toThrow();
  });
});
