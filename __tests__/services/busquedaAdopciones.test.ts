import {
  buscarAdopciones,
  TAMANO_PAGINA,
  AdopcionConDistancia,
} from '../../src/services/busquedaAdopciones';
import { ErrorAmigable } from '../../src/lib/dbErrors';

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

  it('manda la comuna cuando se filtra por ella (F5, 0033)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ comuna: 'Ñuñoa' });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_comuna: 'Ñuñoa' });
  });

  it('sin comuna manda p_comuna null', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ especie: 'perro' });
    expect(mockRpc.mock.calls[0][1].p_comuna).toBeNull();
  });

  it('sin filtros manda todo en null y el orden por defecto', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones();
    const p = mockRpc.mock.calls[0][1];
    expect(p.p_especie).toBeNull();
    expect(p.p_tamano).toBeNull();
    expect(p.p_comuna).toBeNull();
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

// ───────────────────────────────────────────────────────────────────────────
// TEXTO Y EDAD (migración 0052) — y su degradación, que es lo delicado.
//
// La trampa: PostgREST resuelve la función por el JUEGO DE NOMBRES de los
// argumentos. Mandar `p_texto` contra una base donde la 0052 todavía no corrió
// devuelve PGRST202 y se cae el feed ENTERO, no solo el filtro. Por eso los dos
// parámetros nuevos se mandan SOLO cuando se están usando: sin texto ni edad,
// la llamada es byte por byte la de siempre y el feed sigue andando igual.
// ───────────────────────────────────────────────────────────────────────────
describe('buscarAdopciones — texto y edad (0052)', () => {
  it('manda p_texto ya recortado cuando hay búsqueda', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ texto: '  cachorrito negro  ' });
    expect(mockRpc.mock.calls[0][1].p_texto).toBe('cachorrito negro');
  });

  it('manda p_edad cuando se filtra por edad', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ edad: 'senior' });
    expect(mockRpc.mock.calls[0][1].p_edad).toBe('senior');
  });

  it('SIN texto ni edad, la llamada no lleva ni p_texto ni p_edad', async () => {
    // No es cosmético: si fueran siempre (aunque en null), PostgREST no
    // encontraría la firma vieja y el feed se caería entero hasta que alguien
    // corra el SQL.
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ especie: 'perro', comuna: 'Ñuñoa' });
    const enviados = Object.keys(mockRpc.mock.calls[0][1]);
    expect(enviados).not.toContain('p_texto');
    expect(enviados).not.toContain('p_edad');
  });

  it('texto en blanco o de puros espacios tampoco agrega el parámetro', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buscarAdopciones({ texto: '   ' });
    expect(Object.keys(mockRpc.mock.calls[0][1])).not.toContain('p_texto');
  });

  it('con la 0052 sin aplicar y filtro nuevo puesto, explica cómo volver al feed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'schema cache' } });
    const e = await buscarAdopciones({ texto: 'negro' }).then(
      () => null,
      (err: any) => err,
    );
    // Tiene que ser un mensaje NUESTRO (ErrorAmigable), no el crudo de
    // PostgREST, y tiene que decir qué soltar para recuperar el listado.
    expect(e).toBeInstanceOf(ErrorAmigable);
    expect(e.message).toMatch(/texto/i);
    expect(e.message).toMatch(/quit/i);
    expect(e.message).not.toMatch(/schema cache/i);
  });

  it('el mismo PGRST202 SIN filtros nuevos se propaga tal cual (no lo disfrazamos)', async () => {
    // Si acá también dijéramos "quitá el filtro", el mensaje sería absurdo: no
    // hay ningún filtro puesto y el problema es otro.
    const err = { code: 'PGRST202', message: 'schema cache' };
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(buscarAdopciones({ especie: 'gato' })).rejects.toEqual(err);
  });

  it('un error que NO es "falta la migración" se propaga aunque haya texto', async () => {
    // Un corte de red con el buscador escrito no puede decir "quitá el filtro":
    // sacarlo no arregla nada y la persona se queda buscando el problema donde
    // no está.
    const err = { code: '08006', message: 'connection failure' };
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(buscarAdopciones({ texto: 'negro' })).rejects.toEqual(err);
  });
});
