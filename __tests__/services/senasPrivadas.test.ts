import { guardarSenasPrivadas, obtenerSenasPrivadas } from '../../src/services/senasPrivadas';

// La cadena que arma PostgREST/Supabase: `.from(tabla).select(cols).eq(...).maybeSingle()`
// y `.from(tabla).upsert(...)` / `.delete().eq(...)`.
const resultado: { data: any; error: any } = { data: null, error: null };
const mockUpsert = jest.fn((..._a: any[]): any => Promise.resolve({ error: resultado.error }));
const mockDeleteEq = jest.fn((..._a: any[]): any => Promise.resolve({ error: resultado.error }));
const mockSelect = jest.fn();
const mockFrom = jest.fn((..._a: any[]): any => ({
  select: (...cols: any[]) => {
    mockSelect(...cols);
    return {
      eq: () => ({ maybeSingle: () => Promise.resolve(resultado) }),
    };
  },
  upsert: (...a: any[]) => mockUpsert(...a),
  delete: () => ({ eq: (...a: any[]) => mockDeleteEq(...a) }),
}));

jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...a: any[]) => mockFrom(...a) },
}));

beforeEach(() => {
  resultado.data = null;
  resultado.error = null;
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockUpsert.mockClear();
  mockDeleteEq.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Errores que devuelve la base cuando la migración 0047 NO está aplicada.
const SIN_MIGRACION = [
  ['PGRST205 (tabla fuera del cache de esquema)', { code: 'PGRST205', message: "Could not find the table 'public.pet_senas_privadas' in the schema cache" }],
  ['42P01 (undefined_table)', { code: '42P01', message: 'relation "public.pet_senas_privadas" does not exist' }],
  ['sin código, solo el texto', { message: 'Could not find the table in the schema cache' }],
] as const;

describe('obtenerSenasPrivadas', () => {
  it('pide SOLO las dos columnas de señas (nunca `*` ni un join con pets)', async () => {
    resultado.data = { sena_1: 'cicatriz en la panza', sena_2: null };
    await obtenerSenasPrivadas('p1');
    expect(mockFrom).toHaveBeenCalledWith('pet_senas_privadas');
    const cols = String(mockSelect.mock.calls[0][0]);
    expect(cols).toContain('sena_1');
    expect(cols).toContain('sena_2');
    expect(cols).not.toContain('*');
  });

  it('traduce la fila al formato de la app', async () => {
    resultado.data = { sena_1: 'oreja mordida', sena_2: 'cojea' };
    expect(await obtenerSenasPrivadas('p1')).toEqual({ sena1: 'oreja mordida', sena2: 'cojea' });
  });

  it('sin fila (no es el dueño, o no guardó nada) devuelve null', async () => {
    resultado.data = null;
    expect(await obtenerSenasPrivadas('p1')).toBeNull();
  });

  it.each(SIN_MIGRACION)('sin la migración aplicada (%s) devuelve null y NO revienta', async (_n, error) => {
    resultado.error = error;
    await expect(obtenerSenasPrivadas('p1')).resolves.toBeNull();
  });

  it('un error cualquiera tampoco rompe el chat: devuelve null y deja aviso', async () => {
    // Leer la seña pasa DENTRO del chat. Si un corte de red la hiciera tirar, se
    // caería la pantalla entera de mensajes por un extra.
    resultado.error = { code: '42501', message: 'permission denied' };
    await expect(obtenerSenasPrivadas('p1')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('guardarSenasPrivadas', () => {
  it('guarda las señas normalizadas, con el dueño y el reporte', async () => {
    const ok = await guardarSenasPrivadas('p1', 'u1', '  cicatriz en la panza ', '');
    expect(ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('pet_senas_privadas');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pet_id: 'p1',
        user_id: 'u1',
        sena_1: 'cicatriz en la panza',
        sena_2: null,
      }),
      expect.objectContaining({ onConflict: 'pet_id' }),
    );
  });

  it('borrar las dos señas borra la fila (no deja una fila vacía dando vueltas)', async () => {
    const ok = await guardarSenasPrivadas('p1', 'u1', '   ', '');
    expect(ok).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith('pet_id', 'p1');
  });

  it.each(SIN_MIGRACION)('sin la migración aplicada (%s) devuelve false, no tira', async (_n, error) => {
    // Publicar un reporte NO puede fallar porque la 0047 todavía no se aplicó:
    // la mascota perdida importa más que el extra.
    resultado.error = error;
    await expect(guardarSenasPrivadas('p1', 'u1', 'cicatriz', '')).resolves.toBe(false);
  });

  it('un error REAL sí se propaga (el dueño apretó Guardar y tiene que enterarse)', async () => {
    resultado.error = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(guardarSenasPrivadas('p1', 'u1', 'cicatriz', '')).rejects.toBeTruthy();
  });

  it('el borrado también degrada sin migración', async () => {
    resultado.error = { code: 'PGRST205', message: 'Could not find the table in the schema cache' };
    await expect(guardarSenasPrivadas('p1', 'u1', '', '')).resolves.toBe(false);
  });
});
