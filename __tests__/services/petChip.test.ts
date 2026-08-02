import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { guardarChip, leerChip } from '../../src/services/petChip';

// EL NÚMERO DE CHIP — el dato más fuerte y el más sensible del proyecto.
//
// Decisión de la 0054: el chip NO es una columna de `pets` y NO se publica.
// Vive en `pet_chips`, cerrada por RLS al dueño, y ninguna RPC lo devuelve; lo
// único que sale hacia afuera es el booleano `chip_coincide`. Dos motivos:
//
//   · `pets` se lee con `select('*')` en media app y lo exponen las RPC
//     públicas: una columna ahí habría estado a un select('*') de salir impresa.
//   · Publicarlo rompe lo que viene a arreglar. El chip es lo único que prueba
//     de quién es el animal; en el aviso, el estafador que hoy dice "la tengo,
//     mandame plata" pasa a decir "la tengo, su chip es 985112…".
//
// Este archivo ata las dos mitades: que el servicio se porte bien, y que sea el
// ÚNICO lugar de la app que nombra la tabla (mismo guardián que la 0047 puso
// sobre `pet_senas_privadas`).

const llamadas: any[] = [];
let resultado: { data: any; error: any } = { data: null, error: null };
// Cola opcional para los caminos que hacen DOS consultas (borrar el chip: el
// delete y, si volvio con cero filas, la comprobacion de si la fila sigue ahi).
// Vacia = todas las consultas devuelven `resultado`, como siempre.
let cola: { data: any; error: any }[] = [];
const siguiente = () => (cola.length > 0 ? cola.shift()! : resultado);

function builder() {
  const b: any = {
    select: jest.fn((cols: string) => {
      llamadas.push({ op: 'select', cols });
      return b;
    }),
    upsert: jest.fn((fila: any, opts: any) => {
      llamadas.push({ op: 'upsert', fila, opts });
      return Promise.resolve(siguiente());
    }),
    delete: jest.fn(() => {
      llamadas.push({ op: 'delete' });
      return b;
    }),
    eq: jest.fn(() => b),
    maybeSingle: jest.fn(() => Promise.resolve(siguiente())),
    then: (res: any, rej: any) => Promise.resolve(siguiente()).then(res, rej),
  };
  return b;
}

const tablas: string[] = [];
const mockFrom = jest.fn((t: string) => {
  tablas.push(t);
  return builder();
});
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => (mockFrom as any)(...args) },
}));

beforeEach(() => {
  llamadas.length = 0;
  tablas.length = 0;
  resultado = { data: null, error: null };
  cola = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const SIN_TABLA = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.pet_chips'" } };

describe('leerChip', () => {
  it('devuelve el chip guardado', async () => {
    resultado = { data: { chip: '985-112-003' }, error: null };
    expect(await leerChip('p1')).toEqual({ chip: '985-112-003' });
    expect(tablas).toEqual(['pet_chips']);
  });

  it('distingue "no hay chip" de "no pudimos leerlo"', async () => {
    // ES EL TERCER ESTADO Y HACE FALTA. Sin él, "no tenés chip cargado" y "no
    // se pudo leer" se ven igual (casilla vacía) y al guardar se BORRARÍA el
    // chip real. Es exactamente la trampa que ya documentó EditPetScreen con la
    // seña secreta de la 0047.
    resultado = { data: null, error: null };
    expect(await leerChip('p1')).toEqual({ chip: null });

    resultado = SIN_TABLA;
    expect(await leerChip('p1')).toBeNull();
  });

  it('sin la 0054 no molesta a nadie, pero cualquier otro error queda escrito', async () => {
    resultado = SIN_TABLA;
    await leerChip('p1');
    expect(console.warn).not.toHaveBeenCalled();

    resultado = { data: null, error: { code: '42501', message: 'permission denied' } };
    expect(await leerChip('p1')).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('NO TIRA NUNCA: se llama desde adentro de pantallas que tienen que cargar igual', async () => {
    resultado = { data: null, error: { message: 'Failed to fetch' } };
    await expect(leerChip('p1')).resolves.toBeNull();
  });
});

describe('guardarChip', () => {
  it('guarda el número NORMALIZADO, no lo que se tipeó', async () => {
    // Si guardáramos el texto crudo, "985 112" y "985112" serían dos chips
    // distintos para el índice y el cruce no encontraría nada. La base lo
    // vuelve a limpiar por su cuenta (`chip_norm`), pero guardar limpio también
    // acá evita que dos filas del mismo dueño se vean distintas.
    resultado = { data: null, error: null };
    expect(await guardarChip('p1', 'u1', ' 985-112 003 ')).toBe(true);
    const up = llamadas.find((l) => l.op === 'upsert');
    expect(up.fila).toEqual({ pet_id: 'p1', user_id: 'u1', chip: '985112003' });
    expect(up.opts).toEqual({ onConflict: 'pet_id' });
  });

  it('vaciar la casilla BORRA la fila (no deja una con cadena vacía)', async () => {
    // Una fila con chip '' haría creer a la UI que hay algo guardado, y peor:
    // su `chip_norm` sería '' y podría cruzar con cualquier otra basura.
    resultado = { data: null, error: null };
    expect(await guardarChip('p1', 'u1', '   ')).toBe(true);
    expect(llamadas.map((l) => l.op)).toContain('delete');
    expect(llamadas.some((l) => l.op === 'upsert')).toBe(false);
  });

  it('sin la 0054 devuelve false, no revienta: publicar no puede fallar por un extra', async () => {
    resultado = SIN_TABLA;
    expect(await guardarChip('p1', 'u1', '985112003')).toBe(false);
    resultado = SIN_TABLA;
    expect(await guardarChip('p1', 'u1', '')).toBe(false);
  });

  it('cualquier otro error SÍ sube: quien apretó Guardar tiene que enterarse', async () => {
    resultado = { data: null, error: { code: '42501', message: 'row-level security' } };
    await expect(guardarChip('p1', 'u1', '985112003')).rejects.toBeTruthy();
  });

  it('y también al BORRAR: "se borró" sin borrarse es la peor mentira posible', async () => {
    // Las dos ramas (upsert y delete) tienen su propio manejo de error, así que
    // hacen falta dos tests. Con uno solo, la rama de borrado se podía dejar
    // devolviendo `false` en silencio y nada se ponía rojo (comprobado mutando).
    // Acá el dueño está sacando un dato sensible a propósito: si no se fue, no
    // se le puede decir que sí.
    resultado = { data: null, error: { code: '42501', message: 'row-level security' } };
    await expect(guardarChip('p1', 'u1', '')).rejects.toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // …Y EL MODO DE FALLO QUE EL TEST DE ARRIBA NO PODÍA VER.
  //
  // Ese test mockea `42501`, que es justo la respuesta que PostgREST NO da
  // cuando la RLS rechaza un DELETE: no devuelve error, borra cero filas y
  // responde 204. O sea que verificaba la rama del error explícito y dejaba sin
  // cubrir el silencio, que es el modo de fallo real — el mismo que ya había
  // aparecido en `borrarTip`, en `deleteSighting` y en la 0017.
  //
  // Y cero filas es AMBIGUO: puede ser "la RLS lo rechazó" o "no había ningún
  // chip que borrar". Por eso no alcanza con contar filas: hay que desempatar.
  // ─────────────────────────────────────────────────────────────────────────
  it('cero filas borradas + la fila SIGUE ahí = no se borró, y se dice', async () => {
    cola = [
      { data: [], error: null }, // el delete: 204 sin error, cero filas
      { data: { pet_id: 'p1' }, error: null }, // …y la fila sigue existiendo
    ];
    await expect(guardarChip('p1', 'u1', '')).rejects.toBeTruthy();
  });

  it('cero filas borradas + la fila YA no está = vaciar un campo vacío es un éxito', async () => {
    // Sin este desempate, quien abre Editar sin chip cargado y guarda vería un
    // error inventado cada vez.
    cola = [
      { data: [], error: null },
      { data: null, error: null },
    ];
    expect(await guardarChip('p1', 'u1', '')).toBe(true);
  });

  it('el borrado normal devuelve las filas y no hace la segunda consulta', async () => {
    cola = [{ data: [{ pet_id: 'p1' }], error: null }];
    expect(await guardarChip('p1', 'u1', '')).toBe(true);
    // Una sola pasada por la tabla: el desempate solo se paga cuando hace falta.
    expect(tablas).toEqual(['pet_chips']);
  });

  it('el delete PIDE las filas borradas (sin `.select()` no hay nada que contar)', async () => {
    cola = [{ data: [{ pet_id: 'p1' }], error: null }];
    await guardarChip('p1', 'u1', '');
    const ops = llamadas.map((l) => l.op);
    expect(ops).toContain('delete');
    expect(ops.indexOf('select')).toBeGreaterThan(ops.indexOf('delete'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// El guardián que de verdad protege el dato
// ───────────────────────────────────────────────────────────────────────────
const RAIZ = join(__dirname, '..', '..');

function fuentes(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, acc);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acc.push(ruta);
  }
  return acc;
}

/** El archivo sin comentarios: la prosa explica el diseño y da falsos positivos. */
const sinComentarios = (ruta: string) =>
  readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('un solo lugar de la app nombra la tabla del chip', () => {
  it('`pet_chips` se usa únicamente en services/petChip.ts', () => {
    // Si mañana hace falta leer el chip desde otra pantalla, se pasa por acá.
    // Así hay UN solo archivo donde mirar cuando alguien pregunte "¿esto se
    // puede filtrar?". Mismo guardián que la 0047 puso sobre las señas privadas.
    const culpables = fuentes(join(RAIZ, 'src'))
      .filter((ruta) => sinComentarios(ruta).includes('pet_chips'))
      .map((r) => r.replace(RAIZ, ''));
    expect(culpables).toHaveLength(1);
    expect(culpables[0]).toContain('petChip');
  });

  it('ni `Pet` ni `Coincidencia` tienen un campo `chip`', () => {
    // ESTE es el contrato del lado del cliente, hermano del `returns table` sin
    // chip de la 0054. Un `chip` en estos tipos sería la señal de que alguien
    // empezó a traerlo junto con el reporte — y de ahí a pintarlo en la ficha
    // pública hay un paso. Lo único que puede viajar es `chip_coincide`.
    //
    // (Ojo: `my_pets.chip`, de la 0027, es otra cosa y sigue como estaba: es la
    // ficha privada del dueño, no un reporte publicado.)
    const bloqueDeInterfaz = (archivo: string, nombre: string) => {
      const texto = sinComentarios(join(RAIZ, 'src', 'services', archivo));
      const i = texto.indexOf(`interface ${nombre} `);
      expect(i).toBeGreaterThanOrEqual(0);
      return texto.slice(i, texto.indexOf('\n}', i));
    };
    expect(bloqueDeInterfaz('pets.ts', 'Pet')).not.toMatch(/\bchip\b/);
    const coincidencia = bloqueDeInterfaz('busqueda.ts', 'Coincidencia');
    expect(coincidencia).not.toMatch(/\bchip\b/);
    expect(coincidencia).toContain('chip_coincide');
  });
});
