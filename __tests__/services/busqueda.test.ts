import {
  buscarReportes,
  buscarCoincidencias,
  TAMANO_PAGINA,
  PetConDistancia,
} from '../../src/services/busqueda';

const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

function pet(over: Partial<PetConDistancia> = {}): PetConDistancia {
  return {
    id: 'p1', user_id: 'u1', estado: 'perdida', especie: 'perro', raza: null,
    nombre: 'Pelusa', descripcion: 'cafe', fotos: [], lat: -33.4, lng: -70.6,
    recompensa: null, activo: true, oculto: false,
    creado_en: '2026-07-18T10:00:00Z', distancia_km: 1.5, ...over,
  };
}

function pagina(n: number): PetConDistancia[] {
  return Array.from({ length: n }, (_, i) =>
    pet({ id: `p${i}`, creado_en: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00Z` }),
  );
}

beforeEach(() => mockRpc.mockReset());

describe('buscarReportes', () => {
  it('manda los filtros traducidos a los parámetros de la función', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarReportes({
      lat: -33.4, lng: -70.6, radioKm: 5, estado: 'perdida', especie: 'gato',
      texto: '  pelu  ', conRecompensa: true, desde: new Date('2026-07-17T00:00:00Z'),
      orden: 'cerca',
    });
    const [nombre, params] = mockRpc.mock.calls[0];
    expect(nombre).toBe('buscar_reportes');
    expect(params).toMatchObject({
      p_lat: -33.4, p_lng: -70.6, p_radio_km: 5, p_estado: 'perdida',
      p_especie: 'gato', p_con_recompensa: true, p_orden: 'cerca',
    });
    // El texto se recorta antes de mandarlo.
    expect(params.p_texto).toBe('pelu');
    expect(params.p_desde).toBe('2026-07-17T00:00:00.000Z');
  });

  it('manda null en vez de texto vacío, para no filtrar de más', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarReportes({ texto: '   ' });
    expect(mockRpc.mock.calls[0][1].p_texto).toBeNull();
  });

  it('sin filtros manda todo en null y el orden por defecto', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarReportes();
    const p = mockRpc.mock.calls[0][1];
    expect(p.p_lat).toBeNull();
    expect(p.p_estado).toBeNull();
    expect(p.p_con_recompensa).toBe(false);
    expect(p.p_orden).toBe('recientes');
    expect(p.p_cursor_fecha).toBeNull();
  });

  it('devuelve cursor cuando la página vino completa', async () => {
    const filas = pagina(TAMANO_PAGINA);
    mockRpc.mockResolvedValue({ data: filas, error: null });
    const res = await buscarReportes();
    expect(res.reportes).toHaveLength(TAMANO_PAGINA);
    expect(res.cursor).toEqual({
      fecha: filas[filas.length - 1].creado_en,
      id: filas[filas.length - 1].id,
      distancia: filas[filas.length - 1].distancia_km,
    });
  });

  it('devuelve cursor null cuando la página vino incompleta (no hay más)', async () => {
    mockRpc.mockResolvedValue({ data: pagina(3), error: null });
    const res = await buscarReportes();
    expect(res.cursor).toBeNull();
  });

  it('devuelve cursor null con página vacía', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const res = await buscarReportes();
    expect(res.reportes).toEqual([]);
    expect(res.cursor).toBeNull();
  });

  it('reenvía el cursor recibido para pedir la página siguiente', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarReportes({}, { fecha: '2026-07-15T10:00:00Z', id: 'p9', distancia: 3.2 });
    const p = mockRpc.mock.calls[0][1];
    expect(p.p_cursor_fecha).toBe('2026-07-15T10:00:00Z');
    expect(p.p_cursor_id).toBe('p9');
    expect(p.p_cursor_dist).toBe(3.2);
  });

  it('aguanta que la base devuelva null en data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await buscarReportes();
    expect(res.reportes).toEqual([]);
  });

  it('propaga el error de la base', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(buscarReportes()).rejects.toEqual({ message: 'boom' });
  });
});

describe('buscarCoincidencias', () => {
  it('pide las coincidencias del reporte con radio y límite', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarCoincidencias('abc', 20, 5);
    expect(mockRpc).toHaveBeenCalledWith('buscar_coincidencias', {
      p_pet_id: 'abc', p_radio_km: 20, p_limite: 5,
    });
  });

  it('usa 15 km y 10 resultados por defecto', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarCoincidencias('abc');
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_radio_km: 15, p_limite: 10 });
  });

  it('devuelve lista vacía si no hay datos', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await buscarCoincidencias('abc')).toEqual([]);
  });
});
