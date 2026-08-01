import { readFileSync } from 'fs';
import { join } from 'path';
import { responderEstado } from '../../src/services/cierreCasos';
import { RESPUESTAS } from '../../src/lib/cierreCasos';

// EL CONTRATO ENTRE EL CLIENTE Y LA MIGRACIÓN 0049.
//
// Es un contrato que ni `tsc` ni jest verían romperse: los nombres de los
// parámetros de una RPC son strings sueltos, y las tres respuestas están
// escritas dos veces —en TypeScript y en el CHECK del SQL—. Si se desincronizan
// el error aparece recién en producción, como un 404 o un 23514, cuando alguien
// ya tocó el botón.

const mockRpc = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: { rpc: (...a: any[]) => mockRpc(...a) },
}));

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('responderEstado', () => {
  it('llama a la RPC con los nombres de parámetro que espera la 0049', () => {
    responderEstado('pet-1', 'aparecio');
    expect(mockRpc).toHaveBeenCalledWith('responder_estado', {
      p_pet_id: 'pet-1',
      p_respuesta: 'aparecio',
    });
  });

  it('NO le manda el id del usuario', async () => {
    // El dueño sale de `auth.uid()` adentro de la función definer. Si viajara
    // como argumento, cualquiera podría cerrar el reporte de otra persona: es
    // el patrón que ya evitó una escalada de privilegios en `mi_perfil()`.
    await responderEstado('pet-1', 'sigo_buscando');
    const argumentos = JSON.stringify(mockRpc.mock.calls[0][1]);
    expect(argumentos).not.toMatch(/user|uid|dueñ|dueno/i);
    expect(Object.keys(mockRpc.mock.calls[0][1])).toEqual(['p_pet_id', 'p_respuesta']);
  });

  it('el error SUBE, no se traga', async () => {
    // La RPC lanza cuando no actualizó ninguna fila (reporte ajeno) y cuando la
    // migración no está aplicada. Tragarse eso es decirle "listo" a alguien a
    // quien no le guardamos nada — la forma exacta del bug de la 0017.
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
    await expect(responderEstado('pet-1', 'ya_no_busco')).rejects.toMatchObject({
      code: 'PGRST202',
    });
  });
});

describe('las tres respuestas dicen lo mismo de los dos lados', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', 'supabase', 'migrations', '0049_cierre_casos.sql'),
    'utf8',
  );

  /** Los literales entre comillas simples del primer `in (...)` desde `desde`. */
  function valoresDelIn(desde: string): string[] {
    const i = sql.indexOf(desde);
    expect(i).toBeGreaterThanOrEqual(0);
    const abre = sql.indexOf('(', i + desde.length - 1);
    const cierra = sql.indexOf(')', abre);
    return (sql.slice(abre, cierra).match(/'(\w+)'/g) ?? []).map((s) => s.replace(/'/g, ''));
  }

  const esperadas = [...RESPUESTAS].sort();

  it('el CHECK de la columna acepta exactamente las tres, ni una más', () => {
    expect(valoresDelIn('cierre_motivo in (').sort()).toEqual(esperadas);
  });

  it('la lista blanca de la función acepta exactamente las tres, ni una más', () => {
    // Es una defensa DISTINTA de la del CHECK: protege las ramas `case` de
    // adentro. Un motivo desconocido caería en el `else` y cerraría el reporte
    // sin que nadie lo haya pedido. Y una de MENOS es peor todavía: un botón
    // que la app muestra y el servidor rechaza.
    expect(valoresDelIn('p_respuesta not in (').sort()).toEqual(esperadas);
  });
});
