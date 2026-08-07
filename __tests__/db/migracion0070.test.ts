const fs = require('fs');
const path = require('path');
const leer = (n: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', n), 'utf8');

describe('migración 0070', () => {
  const sql = () => leer('0070_impacto_tasa_mediana.sql');

  it('drop + create en el mismo archivo (una transacción)', () => {
    expect(sql()).toMatch(/drop function public\.impacto_comunidad\(\);/);
    expect(sql().indexOf('drop function')).toBeLessThan(
      sql().indexOf('create function public.impacto_comunidad'),
    );
  });

  it('las columnas nuevas van AL FINAL de la firma (la app vieja ignora extras)', () => {
    expect(sql()).toMatch(
      /returns table \(reencuentros bigint, buscando bigint, adopciones bigint, aportes bigint, perdidas_historicas bigint, mediana_dias numeric\)/,
    );
  });

  it('reencuentros y buscando VERBATIM como la 0044 (que Inicio no se contradiga)', () => {
    const v0044 = leer('0044_impacto_buscando.sql');
    const criterioReencuentros = 'reunida_en is not null and oculto = false';
    const criterioBuscando = "activo = true and oculto = false and estado = 'perdida'";
    expect(v0044).toContain(criterioReencuentros);
    expect(v0044).toContain(criterioBuscando);
    expect(sql()).toContain(criterioReencuentros);
    expect(sql()).toContain(criterioBuscando);
  });

  it('la mediana calla con menos de 3 reencuentros', () => {
    expect(sql()).toMatch(/case when count\(\*\) >= 3/);
    expect(sql()).toMatch(/percentile_cont\(0\.5\)/);
  });

  it('impacto_por_comuna: solo comunas con datos, tope 50, grants como la global', () => {
    expect(sql()).toMatch(/create function public\.impacto_por_comuna\(\)/);
    expect(sql()).toMatch(/having/);
    expect(sql()).toMatch(/limit 50/);
    const grants = sql().match(
      /grant execute on function public\.impacto_(comunidad|por_comuna)\(\) to anon, authenticated;/g,
    );
    expect(grants).toHaveLength(2);
  });

  it('las dos son security definer con search_path fijado', () => {
    const m = sql().match(/security definer set search_path = public, pg_temp stable/g);
    expect(m).toHaveLength(2);
  });
});
