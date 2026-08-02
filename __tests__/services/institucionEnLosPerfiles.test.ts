import { getPerfilPublico } from '../../src/services/perfilPublico';
import { getAutorPublico, getMyProfile, getNombrePublico } from '../../src/services/profile';

// LAS TRES PUERTAS POR LAS QUE ENTRA LA INSTITUCION A LA APP (migración 0057):
//
//   · `perfil_publico`  → el perfil público de la veterinaria (RPC, anon-safe).
//   · `mi_perfil`       → mi propio estado, para saber si puedo cargar en lote.
//   · `profiles` select → la firma "Publicado por …" de una ficha.
//
// Las tres tienen que sobrevivir a que la 0057 NO esté aplicada, que es el
// estado normal durante el despliegue (la app sube antes que el SQL). Las dos
// primeras degradan solas porque la RPC vieja no devuelve las claves. La
// tercera NO: un `select` que nombra una columna inexistente devuelve 42703 y
// se lleva puesta la fila "Publicado por …" entera. Ese es el bug que este
// archivo vigila.

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => mockRpc(...a),
    from: (...a: any[]) => mockFrom(...a),
  },
}));

const VERIFICADA = {
  institucion_tipo: 'veterinaria',
  institucion_nombre: 'Vet Ñuñoa',
  institucion_comuna: 'Ñuñoa',
  institucion_contacto: '+56 9 1234 5678',
  institucion_verificada_en: '2026-08-01T10:00:00Z',
};

const FILA_PERFIL = {
  id: 'u1',
  nombre: 'Vet Ñuñoa',
  foto_perfil: null,
  red_social: null,
  creado_en: '2026-01-01T00:00:00Z',
  reencuentros: 2,
  reportes: 3,
  aportes: 4,
  adopciones: 7,
};

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('perfil_publico trae la institución', () => {
  it('una veterinaria verificada llega completa', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...FILA_PERFIL, ...VERIFICADA }], error: null });
    const p = await getPerfilPublico('u1');
    expect(p!.institucion).toEqual({
      tipo: 'veterinaria',
      nombre: 'Vet Ñuñoa',
      comuna: 'Ñuñoa',
      contacto: '+56 9 1234 5678',
    });
    // y no se pierde nada de lo que ya traía (0052/0053)
    expect(p!.adopciones).toBe(7);
    expect(p!.reencuentros).toBe(2);
  });

  it('una persona normal no es una institución', async () => {
    mockRpc.mockResolvedValue({ data: [FILA_PERFIL], error: null });
    expect((await getPerfilPublico('u1'))!.institucion).toBeNull();
  });

  it('sin la 0057 aplicada la RPC vieja no trae las claves: null, no a medias', async () => {
    mockRpc.mockResolvedValue({ data: [FILA_PERFIL], error: null });
    const p = await getPerfilPublico('u1');
    expect(p!.institucion).toBeNull();
    expect(p!.nombre).toBe('Vet Ñuñoa');
  });

  it('una fila a medio escribir (sin fecha de verificación) NO dibuja insignia', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...FILA_PERFIL, ...VERIFICADA, institucion_verificada_en: null }],
      error: null,
    });
    expect((await getPerfilPublico('u1'))!.institucion).toBeNull();
  });
});

describe('mi_perfil: el dueño ve su propio estado institucional', () => {
  it('una cuenta verificada se reconoce a sí misma', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'yo', nombre: 'Vet Ñuñoa', es_admin: false, ...VERIFICADA }],
      error: null,
    });
    const p = await getMyProfile();
    expect(p!.institucion).toEqual({
      tipo: 'veterinaria',
      nombre: 'Vet Ñuñoa',
      comuna: 'Ñuñoa',
      contacto: '+56 9 1234 5678',
    });
  });

  it('sin la 0057, mi_perfil no trae las claves y la institución queda en null', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'yo', nombre: 'Pablo', telefono: '9', red_social: null, es_admin: false }],
      error: null,
    });
    const p = await getMyProfile();
    expect(p!.institucion).toBeNull();
    // el resto del perfil sigue igual que siempre
    expect(p!.telefono).toBe('9');
  });

  it('el escalón de respaldo (mi_perfil sin desplegar) tampoco inventa una institución', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'yo', nombre: 'Pablo', foto_perfil: null, creado_en: 'x' }, error: null }),
        }),
      }),
    });
    const p = await getMyProfile('yo');
    expect(p!.institucion).toBeNull();
    expect(p!.contactoNoDisponible).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getAutorPublico — la firma "Publicado por …" de PetDetail.
// ───────────────────────────────────────────────────────────────────────────

/** Un `from('profiles').select(...).eq(...).maybeSingle()` que registra el select. */
function fromQueDevuelve(porSelect: (select: string) => { data: any; error: any }) {
  const selects: string[] = [];
  mockFrom.mockReturnValue({
    select: (s: string) => {
      selects.push(s);
      return {
        eq: () => ({ maybeSingle: () => Promise.resolve(porSelect(s)) }),
      };
    },
  });
  return selects;
}

describe('getAutorPublico', () => {
  it('trae el nombre y la institución en UNA sola consulta', async () => {
    const selects = fromQueDevuelve(() => ({
      data: { nombre: 'Vet Ñuñoa', eliminado_en: null, ...VERIFICADA },
      error: null,
    }));
    const autor = await getAutorPublico('u1');
    expect(autor).toEqual({
      nombre: 'Vet Ñuñoa',
      institucion: { tipo: 'veterinaria', nombre: 'Vet Ñuñoa', comuna: 'Ñuñoa', contacto: '+56 9 1234 5678' },
    });
    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain('institucion_verificada_en');
  });

  it('SIN la 0057 (42703) reintenta con el select viejo y NO pierde el nombre', async () => {
    // ESTE es el test que justifica el archivo. Un `select` que nombra una
    // columna que no existe devuelve 42703 y, sin el reintento, "Publicado por
    // …" desaparecía de todas las fichas hasta que alguien aplicara el SQL.
    const selects = fromQueDevuelve((s) =>
      s.includes('institucion_')
        ? { data: null, error: { code: '42703', message: 'column does not exist' } }
        : { data: { nombre: 'Pablo', eliminado_en: null }, error: null },
    );
    const autor = await getAutorPublico('u1');
    expect(autor).toEqual({ nombre: 'Pablo', institucion: null });
    expect(selects).toHaveLength(2);
    expect(selects[1]).not.toContain('institucion_');
  });

  it('una lápida (cuenta borrada) no devuelve autor, con 0057 o sin ella', async () => {
    fromQueDevuelve(() => ({ data: { nombre: 'Pablo', eliminado_en: '2026-01-01', ...VERIFICADA }, error: null }));
    expect(await getAutorPublico('u1')).toBeNull();
  });

  it('un nombre vacío no se convierte en una firma en blanco', async () => {
    fromQueDevuelve(() => ({ data: { nombre: '   ', eliminado_en: null }, error: null }));
    expect((await getAutorPublico('u1'))!.nombre).toBeNull();
  });

  it('un error que NO es de columna inexistente no dispara un segundo intento', async () => {
    // Un corte de red o un 500 no se arreglan repitiendo la consulta sin
    // columnas: eso solo esconde el problema y duplica el tráfico.
    const selects = fromQueDevuelve(() => ({ data: null, error: { code: 'PGRST301', message: 'jwt expired' } }));
    expect(await getAutorPublico('u1')).toBeNull();
    expect(selects).toHaveLength(1);
  });

  it('getNombrePublico sigue existiendo y devolviendo lo mismo de siempre', async () => {
    // Lo usa AdopcionDetailScreen para la firma "Responde …". No se toca.
    fromQueDevuelve(() => ({ data: { nombre: 'Pablo', eliminado_en: null }, error: null }));
    expect(await getNombrePublico('u1')).toBe('Pablo');
  });
});
