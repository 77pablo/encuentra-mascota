import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0045 — se puede DESHACER una suspension.
//
// Por que existe: `moderar_suspender` (0040) pone `suspendido_en = now()` y NO
// habia ninguna funcion que lo volviera a null. El panel lo opera una persona a
// mano, contra una lista donde "Suspender" esta al lado de "Descartar": una
// suspension equivocada solo se arreglaba entrando al SQL Editor. Y peor: una
// vez resuelta la denuncia, la cuenta suspendida no aparecia en NINGUNA
// pantalla, asi que ni siquiera se podia saber a quien se habia suspendido.
//
// Esto no prueba la base real (es un archivo de texto). Ata las tres cosas que
// tienen que viajar juntas: el gate de admin, que reactivar no falle en
// silencio, y que la bandeja de suspendidos no dependa de leer `profiles`
// directo (desde la 0018 `authenticated` no puede, y `suspendido_en` de la 0036
// nunca se le concedio: la unica via es una funcion definer).
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0045_moderacion_reactivar.sql'), 'utf8');

// Las aserciones corren sobre el CODIGO: el archivo explica en prosa lo mismo
// que se verifica, asi que buscar sobre el texto crudo da falsos positivos.
const codigo = sql.replace(/--[^\n]*/g, '');

function cuerpoDe(nombre: string): string {
  const idx = codigo.indexOf(`function public.${nombre}`);
  expect(idx).toBeGreaterThanOrEqual(0);
  const abre = codigo.indexOf('as $$', idx);
  expect(abre).toBeGreaterThan(idx);
  const cierra = codigo.indexOf('$$;', abre + 5);
  expect(cierra).toBeGreaterThan(abre);
  return codigo.slice(abre + 5, cierra);
}

describe('moderar_reactivar levanta la suspension', () => {
  const cuerpo = cuerpoDe('moderar_reactivar');

  it('gatea es_admin() ADENTRO de la funcion', () => {
    // El gate va adentro y no en la RLS: la funcion es definer, asi que si el
    // chequeo viviera afuera cualquier autenticado podria reactivar cuentas.
    expect(cuerpo).toContain('if not public.es_admin() then');
    expect(cuerpo).toContain("raise exception 'no autorizado'");
  });

  it('pone suspendido_en en null', () => {
    expect(cuerpo).toMatch(/update\s+public\.profiles\s+set\s+suspendido_en\s*=\s*null/);
  });

  it('exige que la cuenta estuviera suspendida y avisa si no cambio nada', () => {
    // Sin el `and suspendido_en is not null` + `if not found`, reactivar un id
    // inexistente (o ya activo) devolveria exito habiendo hecho cero. Es la
    // misma forma del bug de la 0017: 200 sin haber borrado nada.
    expect(cuerpo).toContain('suspendido_en is not null');
    expect(cuerpo).toContain('if not found then');
  });

  it('recibe el id del USUARIO, no el de la denuncia', () => {
    // A diferencia de moderar_suspender, acá no hay denuncia de donde derivar
    // nada: cuando se suspende, la denuncia queda resuelta y sale de la bandeja.
    expect(codigo).toContain('function public.moderar_reactivar(p_usuario_id uuid)');
    expect(codigo).not.toContain('moderar_reactivar(p_denuncia_id');
  });
});

describe('moderacion_suspendidos es la unica forma de encontrarlas', () => {
  const cuerpo = cuerpoDe('moderacion_suspendidos');

  it('gatea es_admin() adentro', () => {
    expect(cuerpo).toContain('if not public.es_admin() then');
    expect(cuerpo).toContain("raise exception 'no autorizado'");
  });

  it('devuelve solo las suspendidas', () => {
    expect(cuerpo).toContain('suspendido_en is not null');
  });

  it('no lista cuentas ya eliminadas', () => {
    // Una cuenta borrada deja su fila lapida en `profiles` (0017). Si estaba
    // suspendida al borrarse, aparecería para siempre en la bandeja como algo
    // pendiente de resolver, y "reactivarla" no significaría nada.
    expect(cuerpo).toContain('eliminado_en is null');
  });
});

describe('las dos funciones quedan cerradas al mundo', () => {
  it.each([
    ['public.moderar_reactivar(uuid)'],
    ['public.moderacion_suspendidos()'],
  ])('%s: revoke a public y anon, grant solo a authenticated', (firma) => {
    expect(codigo).toContain(`revoke all on function ${firma} from public, anon;`);
    expect(codigo).toContain(`grant execute on function ${firma} to authenticated;`);
  });

  it('las dos son security definer con search_path fijado', () => {
    const definers = codigo.match(/security definer/g) ?? [];
    expect(definers).toHaveLength(2);
    const paths = codigo.match(/set search_path\s*=\s*public,\s*pg_temp/g) ?? [];
    expect(paths).toHaveLength(2);
  });
});

describe('0045 es segura de aplicar en cualquier momento', () => {
  it('no toca tablas, policies ni datos', () => {
    expect(codigo).not.toMatch(/\balter table\b/i);
    expect(codigo).not.toMatch(/\bcreate policy\b/i);
    expect(codigo).not.toMatch(/\bdrop policy\b/i);
    expect(codigo).not.toMatch(/\bdelete from\b/i);
  });

  it('no redefine moderar_suspender ni ninguna funcion previa', () => {
    // Recrear una funcion vecina "de paso" es como se revierten arreglos sin
    // que nadie se entere (paso en tandas anteriores con buscar_reportes).
    expect(codigo).not.toContain('moderar_suspender');
    expect(codigo).not.toContain('moderacion_bandeja');
    expect(codigo).not.toContain('es_admin()\nreturns');
  });
});

// El guardrail de "esta es la ultima migracion del repo" YA NO VIVE ACA: viaja
// siempre con la migracion mas nueva, que hoy es la 0048 (cuadrilla).
//
// En la tanda 10 los tres agentes que agregaron migracion lo mudaron cada uno a
// su archivo, en paralelo y sin saberlo, y el merge dejo tres copias apuntando a
// numeros distintos. Tiene que existir UNA sola, la del numero mas alto: si hay
// dos, la vieja se pone roja para siempre y se termina borrando el guardrail
// entero, que es justo lo que evita que alguien agregue una migracion sin que
// nadie revise el orden de aplicacion.
