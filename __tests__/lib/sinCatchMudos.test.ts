import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Ningún error se traga sin dejar rastro.
//
// Este proyecto ya pagó caro esta clase de bug: `send-push` estuvo SEMANAS sin
// desplegar —o sea, el push del chat nunca funcionó— y nadie se enteró porque
// la llamada colgaba de un `.catch(() => {})`. No hubo error en pantalla, ni en
// la consola, ni en ningún log: simplemente no pasaba nada.
//
// La regla NO es "hay que mostrarle el error a la persona". Muchas de estas
// llamadas son de fondo a propósito y molestar al usuario sería peor: si no se
// pudo leer el nombre de quien publicó, la ficha se lee igual. La regla es que
// el error tiene que quedar ESCRITO en algún lado para poder diagnosticarlo,
// porque el síntoma que ve el usuario ("no aparece el nombre", "el banner me
// sale siempre") no dice nada por sí solo.
//
// Un `.catch()` con cuerpo vacío es indistinguible de un bug. Si de verdad no
// hay nada que registrar, hay que escribir por qué en un comentario y usar
// `.catch(() => { /* motivo */ })`, que este test sí acepta: la diferencia es
// que alguien lo pensó.

const RAIZ = join(__dirname, '..', '..');
const CARPETAS = ['src', join('supabase', 'functions')];

function archivosFuente(dir: string): string[] {
  const salida: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return salida;
  }
  for (const entrada of entradas) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosFuente(ruta));
    else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/**
 * ¿La coincidencia cayó dentro de una línea que es SOLO comentario?
 *
 * Hace falta porque varios comentarios de este repo citan `.catch(() => {})`
 * textualmente para explicar por qué no hay que escribirlo — incluido el de
 * `moderacionAdmin.ts`, que cuenta el incidente de `send-push`. Sin esto el
 * detector se muerde la cola y marca su propia documentación.
 *
 * Se mira la línea de la coincidencia en vez de borrar los comentarios del
 * archivo: borrarlos vaciaba los catch que SÍ están documentados por dentro
 * (`catch { // sin almacenamiento, no pasa nada grave }`) y los convertía en
 * falsos positivos, que es justo lo contrario de lo que este test quiere.
 */
function enLineaDeComentario(codigo: string, posicion: number): boolean {
  const inicio = codigo.lastIndexOf('\n', posicion) + 1;
  const linea = codigo.slice(inicio, posicion);
  return /^\s*(\/\/|\*)/.test(linea);
}

// `.catch(() => {})` y `catch (e) {}` con el cuerpo REALMENTE vacío: entre las
// llaves solo puede haber espacios o saltos de línea. Un comentario adentro lo
// salva a propósito: significa que alguien lo pensó y escribió por qué.
const CATCH_FLECHA_MUDO = /\.catch\(\s*\((?:[^)]*)\)\s*=>\s*\{\s*\}\s*\)/g;
const CATCH_BLOQUE_MUDO = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g;

const hallazgos: Array<{ donde: string; fragmento: string }> = [];
for (const carpeta of CARPETAS) {
  for (const ruta of archivosFuente(join(RAIZ, carpeta))) {
    const codigo = readFileSync(ruta, 'utf8');
    for (const re of [CATCH_FLECHA_MUDO, CATCH_BLOQUE_MUDO]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(codigo)) !== null) {
        if (enLineaDeComentario(codigo, m.index)) continue;
        const linea = codigo.slice(0, m.index).split('\n').length;
        hallazgos.push({
          donde: `${ruta.slice(ruta.indexOf(carpeta.split(/[\\/]/)[0]))}:${linea}`,
          fragmento: m[0].replace(/\s+/g, ' '),
        });
      }
    }
  }
}

describe('ningún error se traga en silencio', () => {
  it('hay archivos que revisar (si esto falla, el buscador quedó ciego)', () => {
    const total = CARPETAS.reduce((n, c) => n + archivosFuente(join(RAIZ, c)).length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it('la expresión detecta un catch mudo de verdad', () => {
    // Sin esta prueba, un error en la expresión dejaría el test en verde para
    // siempre sin mirar nada — que es justo el modo de fallo que persigue.
    const muestra = 'algo().catch(() => {}); try { x(); } catch (e) {}';
    expect(muestra.match(CATCH_FLECHA_MUDO)).toHaveLength(1);
    expect(muestra.match(CATCH_BLOQUE_MUDO)).toHaveLength(1);
  });

  it('un catch con comentario adentro NO cuenta como mudo', () => {
    const conMotivo = 'algo().catch(() => { /* da igual, es best-effort */ });';
    CATCH_FLECHA_MUDO.lastIndex = 0;
    expect(CATCH_FLECHA_MUDO.test(conMotivo)).toBe(false);
  });

  it('no marca los comentarios que CITAN un catch mudo para explicarlo', () => {
    // Caso real que lo hizo fallar la primera vez: varios comentarios de este
    // repo escriben `.catch(() => {})` textualmente para contar por qué no hay
    // que usarlo.
    const documentando = '  // un `.catch(() => {})` acá escondió el bug';
    const pos = documentando.indexOf('.catch');
    expect(enLineaDeComentario(documentando, pos)).toBe(true);
  });

  it('un catch de bloque documentado por dentro NO cuenta como mudo', () => {
    // Segundo caso real: `catch { // sin almacenamiento, no pasa nada grave }`.
    // Al intentar arreglar el punto anterior borrando comentarios, ESTOS se
    // quedaban vacíos y se marcaban al revés.
    const documentado = 'try { x(); } catch {\n  // sin almacenamiento: no pasa nada grave\n}';
    CATCH_BLOQUE_MUDO.lastIndex = 0;
    expect(CATCH_BLOQUE_MUDO.test(documentado)).toBe(false);
  });

  it('no queda ningún catch mudo en src/ ni en las Edge Functions', () => {
    expect(hallazgos.map((h) => `${h.donde}  ${h.fragmento}`)).toEqual([]);
  });
});
