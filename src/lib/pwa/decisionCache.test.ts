import * as fs from 'fs';
import * as path from 'path';
import { estrategiaPara } from './decisionCache';

const ORIGEN = 'https://encuentra-mascota.example';

describe('estrategiaPara', () => {
  it('ignora cualquier origen distinto al propio (nunca intercepta Supabase ni terceros)', () => {
    expect(estrategiaPara('https://xyz.supabase.co/rest/v1/pets', 'cors', ORIGEN)).toBe('ignorar');
    expect(estrategiaPara('https://otra-cosa.com/algo', 'no-cors', ORIGEN)).toBe('ignorar');
  });

  it('cache-first para los bundles hasheados de Expo', () => {
    expect(
      estrategiaPara(`${ORIGEN}/_expo/static/js/web/entry-abc123.js`, 'no-cors', ORIGEN),
    ).toBe('cache-first');
  });

  it('cache-first para los íconos de la PWA', () => {
    expect(estrategiaPara(`${ORIGEN}/icons/icono-192.png`, 'no-cors', ORIGEN)).toBe('cache-first');
  });

  it('red-con-fallback para navegaciones (HTML) del propio origen', () => {
    expect(estrategiaPara(`${ORIGEN}/mascota/abc-123`, 'navigate', ORIGEN)).toBe(
      'red-con-fallback',
    );
    expect(estrategiaPara(`${ORIGEN}/`, 'navigate', ORIGEN)).toBe('red-con-fallback');
  });

  it('red (sin cachear) para cualquier otro pedido del propio origen', () => {
    expect(estrategiaPara(`${ORIGEN}/manifest.webmanifest`, 'no-cors', ORIGEN)).toBe('red');
    expect(estrategiaPara(`${ORIGEN}/algun-json`, 'cors', ORIGEN)).toBe('red');
  });

  it('un origen propio con distinto puerto/protocolo también se considera "otro origen"', () => {
    expect(estrategiaPara('http://encuentra-mascota.example/_expo/static/x.js', 'no-cors', ORIGEN)).toBe(
      'ignorar',
    );
  });
});

// No-tautológico: public/sw.js NO puede importar este módulo (corre en su
// propio scope de worker, fuera del bundle de la app) y REPLICA `estrategiaPara`
// a mano, con un comentario espejo que apunta acá (ver public/sw.js). Nada
// impide que alguien edite una copia y se olvide de la otra — este test lee
// ambos archivos como TEXTO y compara los cuerpos de la función normalizando
// comentarios y espacios, para que ese drift rompa el suite en vez de
// descubrirse en producción.
describe('estrategiaPara — sincronía con la copia a mano de public/sw.js', () => {
  // Extrae el cuerpo (entre las llaves) de `function <nombre>(...) { ... }`
  // contando llaves balanceadas, para no depender de que el cuerpo no tenga
  // bloques anidados (si/entonces con su propio { }).
  function extraerCuerpoDeFuncion(fuente: string, nombre: string): string {
    const inicioFirma = fuente.indexOf(`function ${nombre}(`);
    if (inicioFirma === -1) {
      throw new Error(`No se encontró "function ${nombre}(" en el archivo`);
    }
    const inicioLlave = fuente.indexOf('{', inicioFirma);
    let profundidad = 0;
    let i = inicioLlave;
    for (; i < fuente.length; i++) {
      if (fuente[i] === '{') profundidad++;
      else if (fuente[i] === '}') {
        profundidad--;
        if (profundidad === 0) break;
      }
    }
    return fuente.slice(inicioLlave + 1, i);
  }

  // Quita comentarios de línea y colapsa todo el whitespace (incluidos saltos
  // de línea, CRLF o LF según cómo esté guardado cada archivo) a un solo
  // espacio, para comparar solo la lógica real.
  function normalizar(codigo: string): string {
    return codigo
      .replace(/\r\n/g, '\n')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  it('el cuerpo de estrategiaPara en public/sw.js coincide con el de decisionCache.ts', () => {
    const fuenteSw = fs.readFileSync(path.join(__dirname, '../../../public/sw.js'), 'utf8');
    const fuenteTs = fs.readFileSync(path.join(__dirname, 'decisionCache.ts'), 'utf8');

    const cuerpoSw = normalizar(extraerCuerpoDeFuncion(fuenteSw, 'estrategiaPara'));
    const cuerpoTs = normalizar(extraerCuerpoDeFuncion(fuenteTs, 'estrategiaPara'));

    expect(cuerpoSw).toBe(cuerpoTs);
  });
});
