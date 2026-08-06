import { coseno, DIMENSIONES, esVectorValido, normalizar, resumenSumarVector } from '../../src/lib/vectorFoto';

describe('normalizar', () => {
  it('deja el vector con norma 1', () => {
    const n = normalizar([3, 4]);
    expect(Math.hypot(...n)).toBeCloseTo(1, 6);
  });

  it('un vector de ceros no explota en NaN', () => {
    expect(normalizar([0, 0, 0]).every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('coseno', () => {
  it('vale 1 consigo mismo', () => {
    expect(coseno([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('vale 0 entre ortogonales', () => {
    expect(coseno([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('largos distintos devuelve 0 en vez de mentir', () => {
    expect(coseno([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe('esVectorValido', () => {
  it('exige las 512 dimensiones exactas de CLIP', () => {
    expect(esVectorValido(new Array(DIMENSIONES).fill(0.1))).toBe(true);
    expect(esVectorValido(new Array(DIMENSIONES - 1).fill(0.1))).toBe(false);
  });

  it('rechaza NaN e Infinity (romperian el indice de pgvector)', () => {
    const v = new Array(DIMENSIONES).fill(0.1);
    v[7] = NaN;
    expect(esVectorValido(v)).toBe(false);
    const w = new Array(DIMENSIONES).fill(0.1);
    w[9] = Infinity;
    expect(esVectorValido(w)).toBe(false);
  });

  it('rechaza lo que no es arreglo', () => {
    expect(esVectorValido('512')).toBe(false);
    expect(esVectorValido(null)).toBe(false);
  });
});

const fuenteServicio = () =>
  require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'services', 'vectorFoto.ts'), 'utf8');

it('el modelo se importa dinamico: no entra al bundle de quien nunca lo usa', () => {
  const fuente = fuenteServicio();
  // Un import estatico de la libreria mete ~40 MB en el bundle de TODOS.
  expect(fuente).not.toMatch(/^import [^\n]*@huggingface\/transformers/m);
});

// 6-ago-2026, primera ejecucion real en un navegador: `import('@huggingface/
// transformers')` compilado por Metro LANZA al evaluar el modulo ("Automatic
// publicPath is not supported in this browser") porque el runtime webpack del
// paquete exige `import.meta.url` y Metro no lo provee. La carga tiene que ser
// el import() NATIVO del navegador (via new Function, fuera del alcance de
// Metro) sobre el build ESM oficial servido desde nuestro origen.
it('la libreria se carga con import() nativo del navegador, no via Metro', () => {
  const fuente = fuenteServicio();
  expect(fuente).not.toMatch(/import\(\s*['"]@huggingface\/transformers['"]\s*\)/);
  expect(fuente).toMatch(/new Function\([^)]*import\(/);
  expect(fuente).toMatch(/\/vendor\/transformers\.min\.js/);
});

// El archivo vendoreado tiene que SER el build oficial instalado: si alguien
// actualiza el paquete y no re-copia el archivo, este test lo dice.
it('public/vendor/transformers.min.js es identico al build de node_modules', () => {
  const fs = require('fs');
  const path = require('path');
  const raiz = path.join(__dirname, '..', '..');
  const vendoreado = fs.readFileSync(path.join(raiz, 'public', 'vendor', 'transformers.min.js'));
  const oficial = fs.readFileSync(
    path.join(raiz, 'node_modules', '@huggingface', 'transformers', 'dist', 'transformers.min.js'),
  );
  expect(vendoreado.equals(oficial)).toBe(true);
});

it('en nativo dice que no hay modelo, en vez de fallar al usarse', () => {
  expect(fuenteServicio()).toMatch(/Platform\.OS === 'web'/);
});

it('la escritura mira si volvio fila (la RLS rechaza en silencio)', () => {
  const fuente = fuenteServicio();
  expect(fuente).toMatch(/\.select\(/);
  expect(fuente).toMatch(/length === 0/);
});

it('nunca upsert contra pet_fotos_vector: exige SELECT sobre embedding y da 42501 (B2 lo midio)', () => {
  expect(fuenteServicio()).not.toMatch(/\.upsert\(/);
});

it('nunca .select() pelado contra pet_fotos_vector: select=* toca embedding y da 42501', () => {
  // Todo .select( de este archivo tiene que llevar columnas explicitas.
  expect(fuenteServicio()).not.toMatch(/\.select\(\s*\)/);
});

// B3 (final fix de la tanda 14): un fallo al cargar el pipeline no puede
// quedar cacheado para siempre. NO se pudo probar el comportamiento real de
// principio a fin (ver __tests__/lib/compartirTarjeta.test.ts, comentario
// idéntico para `import('expo-sharing')`): este entorno de test (jest-expo
// sin --experimental-vm-modules) no puede invocar un `await import(...)`
// dinámico en absoluto, así que CUALQUIER llamada a `cargarPipeline` explota
// en el import mismo, antes de llegar al bug — no hay forma de armar un caso
// "falla y despues funciona" contra el código real. Este test ata la FORMA
// del arreglo en el código fuente en su lugar.
it('cargarPipeline limpia el slot cacheado si la carga falla, para poder reintentar', () => {
  const fuente = fuenteServicio();
  const inicio = fuente.indexOf('function cargarPipeline');
  const fin = fuente.indexOf('\n}', inicio);
  expect(inicio).toBeGreaterThan(-1);
  const cuerpo = fuente.slice(inicio, fin);
  expect(cuerpo).toMatch(/\.catch\(/);
  expect(cuerpo).toMatch(/pipelinePromise\s*=\s*null/);
});

describe('resumenSumarVector', () => {
  it('todas las fotos sumaron: mensaje de éxito llano', () => {
    expect(resumenSumarVector(5, 5)).toEqual({
      titulo: 'Listo',
      mensaje: 'Tus fotos ya suman al matching.',
    });
  });

  it('ninguna sumó: invita a reintentar', () => {
    expect(resumenSumarVector(0, 5)).toEqual({
      titulo: 'No se pudo calcular',
      mensaje: 'Probá de nuevo en un rato.',
    });
  });

  it('éxito parcial: lo dice tal cual, ni "Listo" ni "No se pudo" mentirían', () => {
    const r = resumenSumarVector(3, 5);
    expect(r.titulo).not.toBe('Listo');
    expect(r.titulo).not.toBe('No se pudo calcular');
    expect(r.mensaje).toMatch(/3/);
    expect(r.mensaje).toMatch(/5/);
  });

  it('total 0 (sin fotos) no dice "no se pudo": no hay nada que reintentar', () => {
    // El botón ya no se dibuja sin fotos (PetDetailScreen), pero la función
    // pura igual queda bien definida ante ese caso límite.
    expect(resumenSumarVector(0, 0).titulo).toBe('Listo');
  });
});
