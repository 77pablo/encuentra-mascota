import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const sql = readFileSync(join(dir, '0065_coincidencias_con_foto.sql'), 'utf8');
const previa = readFileSync(join(dir, '0058_insignia_suspendida_y_tope_de_radio.sql'), 'utf8');

describe('0065: la foto suma al motor de coincidencias', () => {
  it('cambia el retorno, asi que dropea antes de crear (trampa de la 0024)', () => {
    expect(sql).toMatch(/drop function public\.buscar_coincidencias\(uuid, double precision, int\)/);
    expect(sql).toMatch(/grant execute on function public\.buscar_coincidencias\(uuid, double precision, int\) to anon/);
    expect(sql).toMatch(/grant execute on function public\.buscar_coincidencias\(uuid, double precision, int\) to authenticated/);
  });

  it('conserva el tope de radio de la 0058', () => {
    expect(sql).toMatch(/least\(coalesce\(p_radio_km, 15\), 50\)/);
  });

  it('el chip sigue valiendo 1000 y mandando sobre todo lo demas', () => {
    expect(sql).toMatch(/chip_coincide desc/);
  });

  it('la foto SUMA y NUNCA descarta (regla global de la tanda)', () => {
    // el filtro final solo puede mencionar chip y señas, nunca la foto
    const filtroFinal = sql.slice(sql.indexOf('where cand.chip_coincide'));
    expect(filtroFinal).not.toMatch(/foto_similitud\s*[<>]/);
  });

  it('la foto tampoco descarta desde el where de la CTE cand (mira solo el filtro exterior no basta)', () => {
    // Guardián reforzado (MINOR 6 de la revisión de B4): el guardián anterior
    // sólo miraba el `where cand.chip_coincide ...` del final. Pero el `where`
    // de la CTE `cand` (el que filtra qué candidatos entran) es OTRO lugar
    // donde alguien podría colar un `and f.sim > 0.5` sin que el test de
    // arriba lo note. Recortamos la fórmula del puntaje y el bloque `porque`
    // (los dos únicos lugares donde `f.sim`/`foto_similitud` se comparan
    // LEGÍTIMAMENTE con un número) y comprobamos que en el resto del `from`/
    // `where` de la CTE no sobrevive ninguna comparación con `f.sim` ni con
    // `foto_similitud`.
    const inicioCand = sql.indexOf('cand as (');
    const finCand = sql.indexOf(')\n  -- TODAS las referencias van CALIFICADAS');
    expect(inicioCand).toBeGreaterThan(-1);
    expect(finCand).toBeGreaterThan(inicioCand);
    let cuerpoCand = sql.slice(inicioCand, finCand);

    // Sacamos la fórmula del puntaje (la única comparación legítima de f.sim).
    const inicioFormula = cuerpoCand.indexOf('coalesce(greatest(0, round((nullif(f.sim');
    const finFormula = cuerpoCand.indexOf('as puntaje') + 'as puntaje'.length;
    expect(inicioFormula).toBeGreaterThan(-1);
    cuerpoCand = cuerpoCand.slice(0, inicioFormula) + cuerpoCand.slice(finFormula);

    expect(cuerpoCand).not.toMatch(/f\.sim\s*[<>]/);
    expect(cuerpoCand).not.toMatch(/foto_similitud\s*[<>]/);
  });

  it('el aporte de la foto tiene techo de 60, por debajo del chip', () => {
    // Aserción de la fórmula completa (MINOR 8: `toMatch(/60/)` a secas es
    // casi vacua, cualquier "60" en el archivo la pasaría). La técnica del
    // slice acotado sigue siendo necesaria además: un regex global contra el
    // "1000" del radio (`* 1000`) y el de `distancia_km` (`/ 1000.0`), de la
    // 0058 verbatim, quedaría atrapado igual dentro de la misma sentencia SQL
    // sin punto y coma de por medio.
    expect(sql).toContain(
      "coalesce(greatest(0, round((nullif(f.sim, 'NaN'::float8) - 0.6) / 0.4 * 60))::int, 0)",
    );
    const inicioFormula = sql.indexOf('greatest(0, round((nullif(f.sim');
    const finFormula = sql.indexOf('as puntaje');
    expect(inicioFormula).toBeGreaterThan(-1);
    expect(finFormula).toBeGreaterThan(inicioFormula);
    const formulaFoto = sql.slice(inicioFormula, finFormula);
    expect(formulaFoto).not.toMatch(/1000/);
  });

  it('el vector de norma cero (NaN de pgvector) no revienta la RPC: guarda nullif', () => {
    // IMPORTANT 2 de la revisión: pgvector devuelve NaN para la distancia
    // coseno contra un vector de norma 0, `max()` lo trata como el mayor
    // valor, y `NaN::int` lanza un ERROR de Postgres para CADA vecino si no
    // se lo intercepta antes. `nullif(x, 'NaN'::float8)` SÍ atrapa el caso en
    // Postgres (NaN = NaN da true ahí, al revés que en IEEE 754 estricto).
    expect(sql).toMatch(/nullif\(f\.sim, 'NaN'::float8\)/);
    // Y el mismo guardián en `porque.foto`, que lee `cand.foto_similitud`
    // (alias interno de `f.sim`) por separado.
    expect(sql).toMatch(/nullif\(cand\.foto_similitud, 'NaN'::float8\)/);
  });

  it('el numero de chip sigue sin salir', () => {
    expect(sql).not.toMatch(/returns table[\s\S]*chip\s+text/);
  });

  it('foto_similitud NUNCA sale de la funcion: el coseno exacto es un oraculo del embedding (CRITICAL, decision de Pablo 4-ago)', () => {
    // El `returns table` es la única superficie que de verdad importa: es lo
    // que PostgREST expone. Se recorta desde `returns table` hasta el `as $$`
    // que cierra la firma, y se comprueba que ahí adentro no aparece
    // `foto_similitud` en absoluto — ni como columna del retorno.
    const inicio = sql.indexOf('returns table (');
    // El cierre del `returns table (...)` es el `)` que precede a `\nlanguage
    // sql`, NO el `as $$` (que cierra la definición del CUERPO, mucho más
    // abajo, y de por medio quedarían `language sql`, `stable`, `security
    // definer` y `set search_path`, ninguno relevante para esta aserción).
    const fin = sql.indexOf(')\nlanguage sql');
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const returnsTable = sql.slice(inicio, fin + 1); // +1 para incluir el ')'
    expect(returnsTable).not.toMatch(/foto_similitud/);
    // `porque jsonb` tiene que ser la ÚLTIMA columna del retorno.
    expect(returnsTable.trim().endsWith(')')).toBe(true);
    const columnas = returnsTable
      .replace('returns table (', '')
      .replace(/\)\s*$/, '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    expect(columnas[columnas.length - 1]).toBe('porque jsonb');
  });

  it('el select final tampoco proyecta foto_similitud como columna propia, sólo la usa dentro de porque', () => {
    // Ojo: `cand.foto_similitud` SÍ aparece dentro de la fórmula de `porque`
    // (`nullif(cand.foto_similitud, 'NaN'::float8)`) — eso es legítimo, es
    // uso interno para construir el booleano. Lo que este test prueba es que
    // NO vuelve a existir como columna PROYECTADA por sí sola, es decir el
    // patrón exacto que tenía el código viejo: `cand.puntaje,` seguido en la
    // línea siguiente por `cand.foto_similitud,` como su propio ítem del
    // select.
    expect(sql).not.toMatch(/cand\.puntaje,\s*\n\s*cand\.foto_similitud,/);
  });

  it('foto_similitud sigue viva como columna INTERNA de la CTE cand (la usan puntaje y porque)', () => {
    // No hay que borrar el dato, sólo no exponerlo: adentro de `cand` sigue
    // como `f.sim as foto_similitud`, consumida por la fórmula del puntaje y
    // por `porque.foto`.
    expect(sql).toMatch(/f\.sim as foto_similitud/);
  });

  it('las 12 columnas de la 0058 siguen estando y en el mismo orden', () => {
    for (const col of ['id uuid', 'estado pet_estado', 'especie pet_especie', 'nombre text',
                       'descripcion text', 'fotos text[]', 'lat double precision',
                       'lng double precision', 'creado_en timestamptz',
                       'distancia_km double precision', 'chip_coincide boolean', 'puntaje int']) {
      expect(sql).toContain(col);
      expect(previa).toContain(col);
    }
    // Y ninguna de esas 12 es `foto_similitud` ni `porque`: esas dos van
    // DESPUÉS, `porque` es la única columna nueva (ver el guardián de arriba).
    expect(sql).not.toContain('foto_similitud double precision');
  });
});
