import { coseno, DIMENSIONES, esVectorValido, normalizar } from '../../src/lib/vectorFoto';

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
  expect(fuente).toMatch(/await import\(/);
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
