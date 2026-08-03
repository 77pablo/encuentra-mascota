import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0063_difusion_y_lugares.sql'),
  'utf8',
);

describe('0063: tablero de difusion y semilla de lugares', () => {
  it('NO agrega columnas a pets (media app la lee con select(*))', () => {
    expect(sql).not.toMatch(/alter table public\.pets add column/);
  });

  it('lugares es reimportable: unique por identidad de OSM', () => {
    expect(sql).toMatch(/create table public\.lugares/);
    expect(sql).toMatch(/unique \(osm_tipo, osm_id\)/);
  });

  it('lugares se lee publico y NO lo escribe nadie desde la app', () => {
    expect(sql).toMatch(/grant select on public\.lugares to anon/);
    expect(sql).toMatch(/grant select on public\.lugares to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*public\.lugares to (anon|authenticated)/);
  });

  it('los destinos son del dueño del reporte y de nadie mas', () => {
    expect(sql).toMatch(/create table public\.difusion_destinos/);
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
    expect(sql).toMatch(/alter table public\.difusion_destinos enable row level security/);
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('el tipo y el estado son listas cerradas', () => {
    expect(sql).toMatch(/tipo in \('persona', 'lugar', 'institucion'\)/);
    expect(sql).toMatch(/estado in \('pendiente', 'avisado'\)/);
  });

  it('un destino persona no puede colgar de un lugar ni de una institucion', () => {
    expect(sql).toMatch(/difusion_destinos_puntero_por_tipo/);
  });

  it('lugares_cerca tiene tope de radio (leccion de la 0058)', () => {
    expect(sql).toMatch(/least\(coalesce\(p_radio_km, 5\), 50\)/);
  });
});
