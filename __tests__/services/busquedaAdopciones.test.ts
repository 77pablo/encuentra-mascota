import {
  buscarAdopciones,
  TAMANO_PAGINA,
  AdopcionConDistancia,
} from '../../src/services/busquedaAdopciones';

const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

function adopcion(over: Partial<AdopcionConDistancia> = {}): AdopcionConDistancia {
  return {
    id: 'a1', user_id: 'u1', especie: 'perro', nombre: 'Pelusa',
    descripcion: 'cariñoso', fotos: ['f1'], lat: -33.4, lng: -70.6,
    comuna: 'Ñuñoa', edad: 'adulto', tamano: 'mediano', esterilizado: 'si',
    vacunas: 'al_dia', convive_ninos: 'si', convive_perros: 'no_se',
    convive_gatos: 'no_se', requisitos: null, activo: true,
    adoptada_en: null, oculto: false,
    creado_en: '2026-07-18T10:00:00Z', distancia_km: 1.5, ...over,
  };
}

function pagina(n: number): AdopcionConDistancia[] {
  return Array.from({ length: n }, (_, i) =>
    adopcion({ id: `a${i}`, creado_en: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00Z` }),
  );
}

beforeEach(() => mockRpc.mockReset());

describe('buscarAdopciones', () => {
  it('manda los filtros traducidos a los parámetros de la función', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({
      especie: 'gato', tamano: 'chico', lat: -33.4, lng: -70.6, radioKm: 5,
      orden: 'cerca',
    });
    const [nombre, params] = mockRpc.mock.calls[0];
    expect(nombre).toBe('buscar_adopciones');
    expect(params).toMatchObject({
      p_especie: 'gato', p_tamano: 'chico', p_lat: -33.4, p_lng: -70.6,
      p_radio_km: 5, p_orden: 'cerca',
    });
  });

  it('sin filtros manda todo en null y el orden por defecto', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones();
    const p = mockRpc.mock.calls[0][1];
    expect(p.p_especie).toBeNull();
    expect(p.p_tamano).toBeNull();
    expect(p.p_lat).toBeNull();
    expect(p.p_lng).toBeNull();
    expect(p.p_radio_km).toBeNull();
    expect(p.p_orden).toBe('recientes');
    expect(p.p_cursor_fecha).toBeNull();
    expect(p.p_cursor_id).toBeNull();
    expect(p.p_cursor_dist).toBeNull();
    expect(p.p_limite).toBe(TAMANO_PAGINA);
  });

  it('devuelve cursor cuando la página vino completa', async () => {
    const filas = pagina(TAMANO_PAGINA);
    mockRpc.mockResolvedValue({ data: filas, error: null });
    const res = await buscarAdopciones();
    expect(res.adopciones).toHaveLength(TAMANO_PAGINA);
    expect(res.cursor).toEqual({
      fecha: filas[filas.length - 1].creado_en,
      id: filas[filas.length - 1].id,
      distancia: filas[filas.length - 1].distancia_km,
    });
  });

  it('devuelve cursor null cuando la página vino incompleta (no hay más)', async () => {
    mockRpc.mockResolvedValue({ data: pagina(3), error: null });
    const res = await buscarAdopciones();
    expect(res.cursor).toBeNull();
  });

  it('devuelve cursor null con página vacía', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const res = await buscarAdopciones();
    expect(res.adopciones).toEqual([]);
    expect(res.cursor).toBeNull();
  });

  it('reenvía el cursor recibido para pedir la página siguiente', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({}, { fecha: '2026-07-15T10:00:00Z', id: 'a9', distancia: 3.2 });
    const p = mockRpc.mock.calls[0][1];
    expect(p.p_cursor_fecha).toBe('2026-07-15T10:00:00Z');
    expect(p.p_cursor_id).toBe('a9');
    expect(p.p_cursor_dist).toBe(3.2);
  });

  it('aguanta que la base devuelva null en data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const res = await buscarAdopciones();
    expect(res.adopciones).toEqual([]);
  });

  it('propaga el error de la base', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(buscarAdopciones()).rejects.toEqual({ message: 'boom' });
  });

  it('respeta el límite pasado explícitamente', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({}, null, 5);
    expect(mockRpc.mock.calls[0][1].p_limite).toBe(5);
  });
});
