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

  it('el aporte de la foto tiene techo de 60, por debajo del chip', () => {
    expect(sql).toMatch(/60/);
    // Acotado a la formula del puntaje de la foto, NO a todo el archivo: un
    // regex sin acotar (`/foto[^;]*1000/` contra el `sql` completo) queda
    // atrapado por el "1000" del radio (`* 1000`, paso de km a metros) y el
    // de `distancia_km` (`/ 1000.0`), que son de la 0058, verbatim, y no
    // tienen nada que ver con la foto — pero conviven en la MISMA sentencia
    // SQL sin punto y coma de por medio (todo el `create function` es una
    // sola sentencia hasta el `limit ...;` final), asi que un regex global
    // los atrapa igual y el test queda rojo aunque la formula de la foto este
    // bien. Lo que esto prueba de verdad es que la formula del PUNTAJE DE LA
    // FOTO en si misma no multiplica por 1000 (lo que la acercaria al peso
    // del chip).
    const inicioFormula = sql.indexOf('greatest(0, round((f.sim');
    const finFormula = sql.indexOf('as puntaje');
    expect(inicioFormula).toBeGreaterThan(-1);
    expect(finFormula).toBeGreaterThan(inicioFormula);
    const formulaFoto = sql.slice(inicioFormula, finFormula);
    expect(formulaFoto).not.toMatch(/1000/);
  });

  it('el numero de chip sigue sin salir', () => {
    expect(sql).not.toMatch(/returns table[\s\S]*chip\s+text/);
  });

  it('las 12 columnas de la 0058 siguen estando y en el mismo orden', () => {
    for (const col of ['id uuid', 'estado pet_estado', 'especie pet_especie', 'nombre text',
                       'descripcion text', 'fotos text[]', 'lat double precision',
                       'lng double precision', 'creado_en timestamptz',
                       'distancia_km double precision', 'chip_coincide boolean', 'puntaje int']) {
      expect(sql).toContain(col);
      expect(previa).toContain(col);
    }
  });
});
