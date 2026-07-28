import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de la migracion 0041 (cierre de la Tanda B).
//
// La migracion todavia NO esta aplicada a Supabase (eso es un paso aparte,
// supervisado). Este test no puede probar la base real, pero SI puede evitar los
// dos accidentes que ya pasaron en este repo con las funciones de borrado:
//   · copiar el cuerpo de `anonimizar_mi_cuenta()` y perder un `delete` por el
//     camino (la funcion se reescribe entera en cada migracion que la toca), y
//   · dejar una restriccion cuya definicion mencione la columna `tipo`, que es
//     justo lo que el barrido por `pg_constraint` de la 0030/0032 se lleva
//     puesto (asi se perdio `denuncias_objeto_por_tipo` en silencio).
const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(DIR, '0041_cierre_tanda_b.sql'), 'utf8');

// Cuerpo de una funcion plpgsql: desde `create ... function public.<nombre>`
// hasta el `$$;` que la cierra.
function bloqueFuncion(nombre: string): string {
  const inicio = sql.indexOf(`function public.${nombre}`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  const fin = sql.indexOf('$$;', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return sql.slice(inicio, fin);
}

describe('0041 es la ultima migracion del repo', () => {
  it('no hay ninguna migracion con numero mayor', () => {
    const numeros = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n));
    expect(Math.max(...numeros)).toBe(41);
  });
});

describe('anonimizar_mi_cuenta() se lleva los bloqueos', () => {
  const cuerpo = bloqueFuncion('anonimizar_mi_cuenta()');

  it('borra las filas de `bloqueos` en LAS DOS direcciones', () => {
    // Es el agujero de privacidad que cierra esta migracion: el `on delete
    // cascade` del FK no dispara porque `profiles` sobrevive como lapida.
    expect(cuerpo).toMatch(
      /delete\s+from\s+public\.bloqueos\s+where\s+bloqueador\s*=\s*uid\s+or\s+bloqueado\s*=\s*uid/,
    );
  });

  it('no pierde ninguno de los borrados que ya hacia (0017 + 0037)', () => {
    for (const tabla of [
      'public.notification_events',
      'public.push_tokens',
      'public.notification_prefs',
      'public.favorites',
      'public.alert_zones',
      'public.web_push_subscriptions',
      'public.pets',
    ]) {
      expect(cuerpo).toContain(`delete from ${tabla}`);
    }
  });

  it('sigue dejando la lapida anonima (no borra la fila de profiles)', () => {
    expect(cuerpo).toContain('eliminado_en = now()');
    expect(cuerpo).not.toMatch(/delete\s+from\s+public\.profiles/);
  });

  it('sigue siendo security definer, sin parametros y con search_path fijado', () => {
    expect(cuerpo).toContain('security definer');
    expect(cuerpo).toMatch(/set search_path\s*=\s*public,\s*pg_temp/);
    expect(cuerpo).toContain('anonimizar_mi_cuenta()'); // sin parametro de identidad
    expect(cuerpo).toContain('auth.uid()');
  });

  it('sigue sin poder ser invocada por anon', () => {
    expect(sql).toContain('revoke all on function public.anonimizar_mi_cuenta() from public, anon;');
    expect(sql).toContain('grant execute on function public.anonimizar_mi_cuenta() to authenticated;');
  });
});

describe('endurecimiento de `denuncias`', () => {
  it('pone tope de largo a motivo (1-60) y detalle (<=500)', () => {
    expect(sql).toMatch(/constraint denuncias_motivo_largo[\s\S]{0,120}char_length\(motivo\) between 1 and 60/);
    expect(sql).toMatch(/constraint denuncias_detalle_largo[\s\S]{0,140}char_length\(detalle\) <= 500/);
  });

  it('los nombres de las CHECK nuevas NO mencionan `tipo` en su definicion', () => {
    // Si la definicion mencionara `tipo`, el barrido por pg_constraint que usan
    // la 0030 y la 0032 para ampliar `denuncias.tipo` se las llevaria puestas
    // (fue exactamente asi como se perdio `denuncias_objeto_por_tipo`).
    const bloqueLargos = sql.slice(
      sql.indexOf('denuncias_motivo_largo'),
      sql.indexOf('3. REPONER'),
    );
    expect(bloqueLargos).not.toContain('tipo');
  });

  it('repone `denuncias_objeto_por_tipo` cubriendo adopcion y pregunta_adopcion', () => {
    const i = sql.indexOf('add constraint denuncias_objeto_por_tipo');
    expect(i).toBeGreaterThanOrEqual(0);
    const bloque = sql.slice(i, sql.indexOf(');', i));
    expect(bloque).toContain("tipo = 'reporte' and pet_id is not null");
    expect(bloque).toContain("tipo = 'usuario' and usuario_denunciado is not null");
    for (const t of ['mensaje', 'pista', 'avistamiento', 'adopcion', 'pregunta_adopcion']) {
      expect(bloque).toContain(`'${t}'`);
    }
  });
});

describe('check_denuncias() solo auto-oculta REPORTES', () => {
  const cuerpo = bloqueFuncion('check_denuncias()');

  it('corta antes del count cuando la denuncia no es de un reporte', () => {
    expect(cuerpo).toMatch(/if coalesce\(new\.tipo, 'reporte'\) <> 'reporte' then\s+return new;/);
    // El guard va ANTES del count: si no, no ahorra nada y sigue dependiendo
    // de que pet_id sea null "por suerte".
    expect(cuerpo.indexOf("<> 'reporte'")).toBeLessThan(cuerpo.indexOf('select count(*)'));
  });

  it('conserva el umbral de 3 denuncias y el update a pets', () => {
    expect(cuerpo).toContain('total >= 3');
    expect(cuerpo).toContain('update public.pets set oculto = true');
  });
});

describe('terminos_aceptados_en', () => {
  it('agrega la columna a profiles', () => {
    expect(sql).toMatch(/alter table public\.profiles\s+add column if not exists terminos_aceptados_en timestamptz/);
  });

  it('handle_new_user la sella con now() del servidor y NO con una fecha del cliente', () => {
    const cuerpo = bloqueFuncion('handle_new_user()');
    expect(cuerpo).toContain('terminos_aceptados_en');
    expect(cuerpo).toContain("new.raw_user_meta_data->>'acepta_terminos'");
    expect(cuerpo).toContain('then now()');
    // Nunca leer un timestamp que mande el cliente: no prueba nada.
    expect(cuerpo).not.toContain("raw_user_meta_data->>'terminos_aceptados_en'");
  });

  it('no rompe el registro de quien no manda el booleano (queda NULL)', () => {
    const cuerpo = bloqueFuncion('handle_new_user()');
    expect(cuerpo).toContain('else null');
    // Y sigue guardando lo que ya guardaba (0001 + 0024).
    expect(cuerpo).toContain('nombre');
    expect(cuerpo).toContain('fecha_nacimiento');
  });
});
