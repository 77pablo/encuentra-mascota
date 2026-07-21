import { readFileSync } from 'fs';
import { join } from 'path';

// PRIVACIDAD CRÍTICA (Función 2): la única lectura pública de una ficha es la RPC
// `mascota_por_collar`. Este test es un guardrail estático: lee la migración 0027
// y verifica que la RPC NUNCA amplíe su firma para devolver contacto ni identidad.
// Si alguien agrega user_id/chip/señas/teléfono al `returns table (...)`, falla acá
// (no hay que esperar a un pentest en producción).
const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0027_mi_mascota.sql'),
  'utf8',
);

// Extrae el cuerpo entre 'create function public.mascota_por_collar' y el cierre '$$;'.
function bloqueMascotaPorCollar(): string {
  const inicio = sql.indexOf('create function public.mascota_por_collar');
  expect(inicio).toBeGreaterThanOrEqual(0);
  const fin = sql.indexOf('$$;', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return sql.slice(inicio, fin);
}

// El paréntesis del `returns table (...)`.
function firmaDeRetorno(bloque: string): string {
  const idx = bloque.indexOf('returns table');
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = bloque.indexOf('(', idx);
  const cierra = bloque.indexOf(')', abre);
  return bloque.slice(abre + 1, cierra);
}

describe('RPC mascota_por_collar — contrato de privacidad', () => {
  const bloque = bloqueMascotaPorCollar();
  const retorno = firmaDeRetorno(bloque).toLowerCase();

  it('devuelve exactamente los 4 campos públicos', () => {
    expect(retorno).toContain('nombre');
    expect(retorno).toContain('especie');
    expect(retorno).toContain('foto');
    expect(retorno).toContain('reporte_perdida_id');
  });

  it('NUNCA expone user_id, chip, señas ni datos de contacto', () => {
    for (const prohibido of ['user_id', 'chip', 'senas', 'telefono', 'red_social', 'contacto', 'email']) {
      expect(retorno).not.toContain(prohibido);
    }
  });

  it('la RPC es security definer con search_path fijado (no explotable por search_path)', () => {
    expect(bloque).toContain('security definer');
    expect(bloque).toMatch(/set search_path\s*=\s*public/);
  });

  it('el collar_token se genera en el servidor (default de 128 bits), no lo fija el cliente', () => {
    expect(sql).toMatch(/collar_token[\s\S]*default encode\(gen_random_bytes\(16\), 'hex'\)/);
  });

  it('la tabla my_pets está cerrada por RLS y su política es solo del dueño', () => {
    expect(sql).toContain('alter table public.my_pets enable row level security');
    // Aislamos la sentencia de la policy de my_pets (hasta su `;`) para no
    // barrer con `to anon` de grants no relacionados más abajo en el archivo.
    const iPolicy = sql.indexOf('on public.my_pets for');
    expect(iPolicy).toBeGreaterThanOrEqual(0);
    const policy = sql.slice(iPolicy, sql.indexOf(';', iPolicy));
    expect(policy).toContain('to authenticated');
    expect(policy).toContain('auth.uid() = user_id');
    expect(policy).not.toContain('anon');
  });
});
