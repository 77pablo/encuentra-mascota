import { createPet, updatePet } from '../../src/services/pets';
import { buscarCoincidencias, buscarReportes } from '../../src/services/busqueda';

// LA WEB TIENE QUE ANDAR CON LA 0054 SIN APLICAR.
//
// Es la regla dura de esta tanda y acá está la parte que la sostiene. Las cuatro
// columnas nuevas (`colores`, `tamano`, `sexo`, `esterilizado`) viajan en el
// MISMO insert que el resto del reporte, y PostgREST no guarda filas parciales:
// si no las conoce, rebota el insert ENTERO con PGRST204 y la mascota perdida no
// se publica. O sea que una mejora del motor de coincidencias apagaría la
// función central de la app en cualquier base sin migrar.
//
// Lo mismo del otro lado: `buscar_reportes` gana dos parámetros. Si el cliente
// los mandara SIEMPRE, contra una base sin la 0054 PostgREST no encontraría
// ninguna firma que calce (PGRST202) y Explorar quedaría en blanco para todos.

const inserts: any[] = [];
const updates: any[] = [];
let resultados: { data: any; error: any }[] = [];
let idx = 0;

function siguiente() {
  return resultados[idx++] ?? { data: { id: 'x' }, error: null };
}

function makeQueryBuilder() {
  const builder: any = {
    insert: jest.fn((fila: any) => {
      inserts.push(fila);
      return builder;
    }),
    update: jest.fn((fila: any) => {
      updates.push(fila);
      return builder;
    }),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(siguiente())),
    // `updatePet` no encadena `.single()`: el await cae sobre el builder.
    then: (res: any, rej: any) => Promise.resolve(siguiente()).then(res, rej),
  };
  return builder;
}

const rpcArgs: any[] = [];
const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  rpcArgs.length = 0;
  resultados = [];
  idx = 0;
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => makeQueryBuilder());
  mockRpc.mockReset();
  mockRpc.mockImplementation((nombre: string, args: any) => {
    rpcArgs.push({ nombre, args });
    return Promise.resolve(siguiente());
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

const INPUT = {
  estado: 'perdida' as const,
  especie: 'perro' as const,
  descripcion: 'mestizo grande',
  lat: -33.4,
  lng: -70.6,
};

const OK = { data: { id: 'pet-1' }, error: null };
const faltaColumna = (col: string) => ({
  data: null,
  error: { code: 'PGRST204', message: `Could not find the '${col}' column of 'pets' in the schema cache` },
});

// ───────────────────────────────────────────────────────────────────────────
describe('createPet con la 0054 aplicada', () => {
  it('manda las cuatro señas en el insert', async () => {
    resultados = [OK];
    await createPet(
      { ...INPUT, colores: ['negro', 'blanco'], tamano: 'grande', sexo: 'macho', esterilizado: 'si' },
      ['f.jpg'],
      'u1',
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(
      expect.objectContaining({
        colores: ['negro', 'blanco'],
        tamano: 'grande',
        sexo: 'macho',
        esterilizado: 'si',
      }),
    );
  });

  it('lo que no se contestó ni siquiera viaja como clave', async () => {
    // Mandar `tamano: null` y no mandarlo son lo mismo para la base, pero no
    // para PostgREST cuando la columna no existe: la clave sola ya rebota el
    // insert entero. Sin dato, sin clave.
    resultados = [OK];
    await createPet({ ...INPUT, tamano: 'chico' }, [], 'u1');
    expect('sexo' in inserts[0]).toBe(false);
    expect('colores' in inserts[0]).toBe(false);
    expect(inserts[0].tamano).toBe('chico');
  });

  it('una lista de colores vacía no viaja (es lo mismo que no contestar)', async () => {
    resultados = [OK];
    await createPet({ ...INPUT, colores: [] }, [], 'u1');
    expect(inserts).toHaveLength(1);
    expect('colores' in inserts[0]).toBe(false);
  });
});

describe('createPet SIN la 0054 aplicada', () => {
  it('reintenta sin NINGUNA de las cuatro y publica igual', async () => {
    // PostgREST nombra UNA sola columna por error. Si soltáramos solo esa,
    // harían falta cuatro reintentos —y cuatro chances de publicar dos veces—.
    // Se suelta el grupo entero de la migración de una.
    resultados = [faltaColumna('colores'), OK];
    const pet = await createPet(
      { ...INPUT, colores: ['negro'], tamano: 'grande', sexo: 'macho', esterilizado: 'no' },
      [],
      'u1',
    );
    expect(pet).toEqual({ id: 'pet-1' });
    expect(inserts).toHaveLength(2);
    for (const col of ['colores', 'tamano', 'sexo', 'esterilizado']) {
      expect({ col, viaja: col in inserts[1] }).toEqual({ col, viaja: false });
    }
    // Y no pierde nada más por el camino.
    expect(inserts[1]).toEqual(
      expect.objectContaining({ descripcion: 'mestizo grande', user_id: 'u1' }),
    );
  });

  it('el ámbito (0046) NO se sacrifica cuando lo que falta es la 0054', async () => {
    // Las dos migraciones son independientes: una base puede tener la 0046 y no
    // la 0054. Soltar todo junto le sacaría al reporte la calibración del radio
    // sin ningún motivo.
    resultados = [faltaColumna('colores'), OK];
    await createPet({ ...INPUT, especie: 'gato', ambito: 'interior', colores: ['gris'] }, [], 'u1');
    expect(inserts).toHaveLength(2);
    expect(inserts[1].ambito).toBe('interior');
    expect('colores' in inserts[1]).toBe(false);
  });

  it('si faltan las DOS migraciones, suelta un grupo por intento', async () => {
    // PostgREST nombra una columna que SÍ se mandó (la primera que no conoce),
    // así que el caso realista es "falta tamano" y después "falta ambito".
    resultados = [faltaColumna('tamano'), faltaColumna('ambito'), OK];
    const pet = await createPet(
      { ...INPUT, especie: 'gato', ambito: 'interior', tamano: 'chico' },
      [],
      'u1',
    );
    expect(pet).toEqual({ id: 'pet-1' });
    expect(inserts).toHaveLength(3);
    expect('ambito' in inserts[2]).toBe(false);
    expect('tamano' in inserts[2]).toBe(false);
  });

  it('el error tiene que hablar de una columna que MANDAMOS', async () => {
    // Si el que falta es un campo que ni siquiera enviamos, soltar nuestras
    // señas no arregla nada y encima esconde el problema real (es la advertencia
    // que ya tiene escrita `esColumnaFaltante`). Sin este chequeo el reintento
    // saldría igual, perdería los datos y taparía el error de verdad.
    resultados = [faltaColumna('colores'), OK];
    await expect(createPet({ ...INPUT, tamano: 'chico' }, [], 'u1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('colores') }),
    );
    expect(inserts).toHaveLength(1);
  });

  it('un rechazo de RLS NO se reintenta: publicar dos veces sería peor', async () => {
    resultados = [
      { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } },
      OK,
    ];
    await expect(createPet({ ...INPUT, tamano: 'chico' }, [], 'u1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('row-level security') }),
    );
    expect(inserts).toHaveLength(1);
  });
});

describe('updatePet (editar el reporte) degrada igual', () => {
  it('manda las señas cuando la base las conoce', async () => {
    resultados = [{ data: null, error: null }];
    await updatePet('p1', { descripcion: 'x', colores: ['negro'], tamano: 'chico' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(expect.objectContaining({ colores: ['negro'], tamano: 'chico' }));
  });

  it('sin la 0054 reintenta sin ellas: guardar una corrección no puede fallar por un extra', async () => {
    resultados = [faltaColumna('tamano'), { data: null, error: null }];
    await updatePet('p1', { descripcion: 'x', colores: ['negro'], tamano: 'chico' });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ descripcion: 'x' });
  });

  it('cualquier otro error sube: quien apretó Guardar tiene que enterarse', async () => {
    resultados = [{ data: null, error: { code: '42501', message: 'row-level security' } }];
    await expect(updatePet('p1', { descripcion: 'x', tamano: 'chico' })).rejects.toBeTruthy();
    expect(updates).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('buscarReportes: los filtros nuevos solo viajan si se usan', () => {
  it('sin filtro de seña, la llamada es la de SIEMPRE (14 argumentos)', async () => {
    // ESTE es el test que sostiene la regla. Con la 0054 sin aplicar, mandar
    // p_color/p_tamano deja a PostgREST sin ninguna firma que calce y Explorar
    // queda en blanco para todo el mundo, filtre o no filtre la persona.
    resultados = [{ data: [], error: null }];
    await buscarReportes({ especie: 'perro' });
    expect(rpcArgs).toHaveLength(1);
    expect('p_color' in rpcArgs[0].args).toBe(false);
    expect('p_tamano' in rpcArgs[0].args).toBe(false);
    expect(rpcArgs[0].args.p_especie).toBe('perro');
  });

  it('con filtro de color, viajan los dos parámetros', async () => {
    resultados = [{ data: [], error: null }];
    await buscarReportes({ color: 'negro' });
    expect(rpcArgs[0].args.p_color).toBe('negro');
    expect(rpcArgs[0].args.p_tamano).toBeNull();
  });

  it('si la RPC vieja no conoce los parámetros, reintenta sin ellos', async () => {
    // PGRST202 = PostgREST no encontró NINGUNA función con esa firma. Se pierde
    // el filtro, no la pantalla.
    resultados = [
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
      { data: [{ id: 'a', creado_en: 'x', distancia_km: null }], error: null },
    ];
    const pagina = await buscarReportes({ color: 'negro' });
    expect(rpcArgs).toHaveLength(2);
    expect('p_color' in rpcArgs[1].args).toBe(false);
    expect(pagina.reportes).toHaveLength(1);
    // Y queda escrito: sin esto, el filtro "no hace nada" y nadie sabe por qué.
    expect(console.warn).toHaveBeenCalled();
  });

  it('un error de verdad NO se reintenta ni se traga', async () => {
    resultados = [{ data: null, error: { code: '42501', message: 'permission denied' } }];
    await expect(buscarReportes({ color: 'negro' })).rejects.toBeTruthy();
    expect(rpcArgs).toHaveLength(1);
  });
});

describe('buscarCoincidencias', () => {
  it('no cambia su firma: la 0054 no le tocó los parámetros', async () => {
    resultados = [{ data: [], error: null }];
    await buscarCoincidencias('p1');
    expect(Object.keys(rpcArgs[0].args).sort()).toEqual(['p_limite', 'p_pet_id', 'p_radio_km']);
  });

  it('deja pasar chip_coincide y puntaje, y tolera que no vengan', async () => {
    resultados = [
      {
        data: [
          { id: 'a', chip_coincide: true, puntaje: 1020 },
          { id: 'b' },
        ],
        error: null,
      },
    ];
    const r = await buscarCoincidencias('p1');
    expect(r[0].chip_coincide).toBe(true);
    expect(r[0].puntaje).toBe(1020);
    // Sin la 0054 la RPC vieja devuelve las columnas de siempre y nada más: el
    // cliente no puede asumir que estén.
    expect(r[1].chip_coincide).toBeUndefined();
  });
});
