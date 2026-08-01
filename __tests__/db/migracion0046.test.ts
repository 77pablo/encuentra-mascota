import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTÁTICO de la migración 0046 — la columna `ambito`.
//
// Esto NO prueba la base real (es un archivo de texto). Lo que ata es la REGLA
// de esta tanda: la web tiene que seguir funcionando con la 0046 SIN aplicar.
// La trampa concreta de PostgREST es que no devuelve datos parciales: pedir una
// columna nueva en el mismo `select` que las viejas hace fallar la consulta
// ENTERA. Así que la mitad de estos tests miran la migración y la otra mitad
// miran el CÓDIGO DE LA APP, que es donde esa trampa se pisa.
const RAIZ = join(__dirname, '..', '..');
const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '0046_ambito.sql'), 'utf8');

// Las aserciones corren sobre el CÓDIGO: el archivo explica en prosa lo mismo
// que se verifica, así que buscar sobre el texto crudo da falsos positivos.
const codigo = sql.replace(/--[^\n]*/g, '').toLowerCase();

describe('la columna ambito', () => {
  it('se agrega de forma idempotente', () => {
    expect(codigo).toMatch(/alter table public\.pets\s+add column if not exists ambito text/);
  });

  it('es NULLABLE y sin default: "no sé" es una respuesta válida', () => {
    // La pregunta del ámbito es OMITIBLE. Un `not null` obligaría a inventar
    // una respuesta, y un `default 'exterior'` haría pasar por dato del dueño
    // algo que nadie contestó.
    expect(codigo).not.toMatch(/ambito text[^;]*not null/);
    expect(codigo).not.toMatch(/ambito text[^;]*default/);
  });

  it('tiene un CHECK que acepta null y solo los dos ámbitos', () => {
    expect(codigo).toContain('pets_ambito_valido');
    expect(codigo).toMatch(/ambito is null or ambito in \('interior',\s*'exterior'\)/);
    // Re-ejecutable: sin el drop previo, correr la migración dos veces revienta.
    expect(codigo).toContain('drop constraint if exists pets_ambito_valido');
  });
});

describe('la 0046 no toca nada de lo que la app ya depende', () => {
  it('no recrea ni dropea buscar_reportes', () => {
    // La RPC devuelve una lista fija de columnas y `create or replace` NO puede
    // cambiar su `returns table (...)`: haría falta `drop function` y una
    // ventana en la que la búsqueda no existe para nadie. El ámbito no vale eso:
    // las pantallas que lo necesitan leen el reporte con `select('*')`.
    expect(codigo).not.toContain('buscar_reportes');
    expect(codigo).not.toContain('drop function');
  });

  it('no toca las policies de RLS de pets', () => {
    expect(codigo).not.toContain('policy');
  });
});

// El guardrail de "esta es la última migración del repo" NO vive acá: viaja
// siempre con la más nueva, que tras la tanda 10 es la 0048 (cuadrilla).
//
// Estuvo un rato en este archivo. Tres agentes en paralelo agregaron migración
// (0046, 0047 y 0048) y los tres lo mudaron al suyo sin saber del otro, así que
// el merge dejó tres copias afirmando 46, 47 y 48. Dos iban a quedar rojas para
// siempre, y el final previsible de eso es que alguien borre el guardrail entero
// por molesto. Tiene que haber UNA sola: la del número más alto.

/** Todos los .ts/.tsx de src/, recursivo. */
function fuentes(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

describe('la app no pide `ambito` en ningún select con lista de columnas', () => {
  it('ningún .select("…ambito…") en src/', () => {
    // ESTA es la trampa. `select('*')` degrada solo (la columna simplemente no
    // viene). Pero `select('id, estado, ambito')` contra una base sin la 0046
    // devuelve error y `data` null: se cae la consulta entera, no solo el campo.
    const culpables: string[] = [];
    for (const ruta of fuentes(join(RAIZ, 'src'))) {
      const texto = readFileSync(ruta, 'utf8');
      for (const m of texto.matchAll(/\.select\(\s*(['"`])([^'"`]*)\1/g)) {
        if (m[2] !== '*' && /\bambito\b/.test(m[2])) culpables.push(`${ruta}: ${m[2]}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
