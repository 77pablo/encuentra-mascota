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

  // Critical 1: 'revoke ... from public' NO le saca el EXECUTE a anon en este
  // proyecto (alter default privileges se lo concede explicito). Sin nombrar
  // los tres roles en el revoke, anon queda pudiendo ejecutar la funcion pese
  // a que el unico 'grant execute' del archivo es a authenticated.
  it('lugares_cerca revoca a anon Y a authenticated antes de conceder solo a authenticated', () => {
    const revoke = sql.match(
      /revoke all on function public\.lugares_cerca\([^)]*\) from ([^;]+);/,
    );
    expect(revoke).not.toBeNull();
    const roles = revoke![1];
    expect(roles).toMatch(/\bpublic\b/);
    expect(roles).toMatch(/\banon\b/);
    expect(roles).toMatch(/\bauthenticated\b/);
    // Y el unico grant execute de la funcion es a authenticated, nunca a anon.
    const grants = [...sql.matchAll(/grant execute on function public\.lugares_cerca\([^)]*\) to (\w+)/g)];
    expect(grants.length).toBeGreaterThan(0);
    expect(grants.every((m) => m[1] === 'authenticated')).toBe(true);
  });

  // Critical 2: la funcion es security definer y se saltea la RLS de pets
  // (que exige activo = true para el publico). El where tiene que repetir esa
  // condicion -- o la excepcion simetrica del dueño, como el pet base de
  // buscar_coincidencias en la 0058 -- y no solo 'oculto'.
  it('lugares_cerca filtra pets.activo ademas de oculto, con la excepcion del dueño', () => {
    const cuerpo = sql.match(/create or replace function public\.lugares_cerca[\s\S]*?\$\$;/);
    expect(cuerpo).not.toBeNull();
    expect(cuerpo![0]).toMatch(/b\.oculto = false/);
    expect(cuerpo![0]).toMatch(/b\.activo = true/);
  });

  // Critical 3: 'on delete set null' en lugar_id/institucion_id es incompatible
  // con el CHECK difusion_destinos_puntero_por_tipo (que exige que un destino
  // 'lugar' SIEMPRE tenga lugar_id, y uno 'institucion' SIEMPRE tenga
  // institucion_id). Con 'set null' borrar el lugar o la institucion referenciada
  // aborta el DELETE con 23514 en vez de limpiar el destino.
  it('las FK de lugar_id e institucion_id cascadean en vez de dejar null (compatibles con el CHECK)', () => {
    expect(sql).toMatch(/lugar_id uuid references public\.lugares\(id\) on delete cascade/);
    expect(sql).toMatch(/institucion_id uuid references public\.profiles\(id\) on delete cascade/);
    expect(sql).not.toMatch(/lugar_id uuid references public\.lugares\(id\) on delete set null/);
    expect(sql).not.toMatch(/institucion_id uuid references public\.profiles\(id\) on delete set null/);
  });

  // Minor 4: un destino 'lugar' o 'institucion' no puede traer ademas una
  // etiqueta -- dato muerto, incoherente con "cada tipo cuelga de lo suyo".
  it('el CHECK del puntero por tipo tambien exige etiqueta null en lugar e institucion', () => {
    const check = sql.match(
      /add constraint difusion_destinos_puntero_por_tipo\s+check \([\s\S]*?\n\s*\);/,
    );
    expect(check).not.toBeNull();
    const cuerpoCheck = check![0];
    // La clausula de 'lugar' va desde su "or (tipo = 'lugar'" hasta el
    // siguiente "or (tipo" (la de institucion), y la de 'institucion' desde
    // ahi hasta el cierre del CHECK. indexOf en vez de regex porque los
    // parentesis anidados no son balanceables con regex de JS.
    const iLugar = cuerpoCheck.indexOf("tipo = 'lugar'");
    const iInstitucion = cuerpoCheck.indexOf("tipo = 'institucion'");
    expect(iLugar).toBeGreaterThan(-1);
    expect(iInstitucion).toBeGreaterThan(iLugar);
    const clausulaLugar = cuerpoCheck.slice(iLugar, iInstitucion);
    const clausulaInstitucion = cuerpoCheck.slice(iInstitucion);
    expect(clausulaLugar).toMatch(/etiqueta is null/);
    expect(clausulaInstitucion).toMatch(/etiqueta is null/);
  });

  // Minor 6: falta la unicidad de institucion_id por pet_id, simetrica a la
  // que ya existe para lugar_id -- sin ella la misma institucion se agrega
  // dos veces al mismo tablero.
  it('institucion_id tiene indice unico parcial por pet_id, simetrico al de lugar_id', () => {
    expect(sql).toMatch(
      /create unique index difusion_destinos_institucion_unico\s*\n\s*on public\.difusion_destinos \(pet_id, institucion_id\) where institucion_id is not null/,
    );
  });
});
