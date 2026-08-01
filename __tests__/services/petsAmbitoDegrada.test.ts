import { createPet } from '../../src/services/pets';
import { esColumnaFaltante } from '../../src/lib/dbErrors';

// PUBLICAR TIENE QUE FUNCIONAR AUNQUE LA 0046 NO ESTÉ APLICADA.
//
// `ambito` (columna nueva de la migración 0046) se manda en el MISMO insert que
// el resto del reporte. PostgREST no guarda parte de la fila y descarta lo que
// no entiende: si la columna no existe, rebota el insert ENTERO con PGRST204 y
// la persona no puede publicar su mascota perdida. O sea que la columna nueva
// rompería la función central de la app en cualquier base sin migrar.
//
// Estos tests fijan la degradación: se intenta con `ambito`, y si la base no lo
// conoce se reintenta sin él. El dato del ámbito se pierde (es una mejora del
// radio, no un dato crítico); el reporte se publica igual.

// Builder falso que imita el encadenado de supabase-js. Cada llamada a
// `.insert(...)` queda registrada para poder ver QUÉ se mandó y CUÁNTAS veces.
const inserts: any[] = [];
let resultados: { data: any; error: any }[] = [];

function makeQueryBuilder() {
  const idx = inserts.length;
  const builder: any = {
    insert: jest.fn((fila: any) => {
      inserts.push(fila);
      return builder;
    }),
    select: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(resultados[idx] ?? { data: { id: 'x' }, error: null })),
  };
  return builder;
}

const mockFrom = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

beforeEach(() => {
  inserts.length = 0;
  resultados = [];
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => makeQueryBuilder());
});

const INPUT = {
  estado: 'perdida' as const,
  especie: 'gato' as const,
  descripcion: 'atigrado, collar rojo',
  lat: -33.4,
  lng: -70.6,
};

const OK = { data: { id: 'pet-1', estado: 'perdida' }, error: null };
const SIN_COLUMNA = {
  data: null,
  error: {
    code: 'PGRST204',
    message: "Could not find the 'ambito' column of 'pets' in the schema cache",
  },
};
const SIN_COLUMNA_PG = {
  data: null,
  error: { code: '42703', message: 'column "ambito" of relation "pets" does not exist' },
};

describe('createPet con la 0046 aplicada', () => {
  it('manda el ámbito en el insert', async () => {
    resultados = [OK];
    await createPet({ ...INPUT, ambito: 'interior' }, ['f.jpg'], 'user-1');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.objectContaining({ ambito: 'interior' }));
  });
});

describe('createPet SIN la 0046 aplicada', () => {
  it('reintenta sin la columna y publica igual (PGRST204)', async () => {
    resultados = [SIN_COLUMNA, OK];
    const pet = await createPet({ ...INPUT, ambito: 'interior' }, ['f.jpg'], 'user-1');
    expect(pet).toEqual({ id: 'pet-1', estado: 'perdida' });
    expect(inserts).toHaveLength(2);
    // El segundo intento va limpio: si volviera a mandar `ambito`, rebotaría
    // exactamente igual y no habríamos degradado nada.
    expect(inserts[1].ambito).toBeUndefined();
    expect('ambito' in inserts[1]).toBe(false);
    // Y no pierde nada más por el camino.
    expect(inserts[1]).toEqual(
      expect.objectContaining({ descripcion: 'atigrado, collar rojo', fotos: ['f.jpg'], user_id: 'user-1' }),
    );
  });

  it('reintenta igual con el error crudo de Postgres (42703)', async () => {
    resultados = [SIN_COLUMNA_PG, OK];
    const pet = await createPet({ ...INPUT, ambito: 'exterior' }, [], 'user-1');
    expect(pet).toEqual({ id: 'pet-1', estado: 'perdida' });
    expect(inserts).toHaveLength(2);
  });

  it('si el reintento también falla, ese error sí sube', async () => {
    resultados = [SIN_COLUMNA, { data: null, error: { message: 'Alcanzaste el límite de publicaciones' } }];
    await expect(createPet({ ...INPUT, ambito: 'interior' }, [], 'user-1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('límite de publicaciones') }),
    );
  });
});

describe('createPet no confunde otros errores con una columna faltante', () => {
  it('un rechazo de RLS NO se reintenta: se propaga tal cual', async () => {
    const rls = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    resultados = [rls, OK];
    await expect(createPet({ ...INPUT, ambito: 'interior' }, [], 'user-1')).rejects.toEqual(
      expect.objectContaining({ message: expect.stringContaining('row-level security') }),
    );
    // Un segundo insert acá sería publicar dos veces ante un error transitorio.
    expect(inserts).toHaveLength(1);
  });

  it('sin ámbito no hay nada que degradar: un solo insert y sin la clave', async () => {
    resultados = [OK];
    await createPet(INPUT, [], 'user-1');
    expect(inserts).toHaveLength(1);
    expect('ambito' in inserts[0]).toBe(false);
  });
});

describe('esColumnaFaltante', () => {
  it('reconoce las dos formas en que PostgREST/Postgres avisan', () => {
    expect(esColumnaFaltante(SIN_COLUMNA.error, 'ambito')).toBe(true);
    expect(esColumnaFaltante(SIN_COLUMNA_PG.error, 'ambito')).toBe(true);
  });

  it('exige que el error hable de ESA columna', () => {
    // Si el que falta es otro campo, reintentar sin `ambito` no arregla nada y
    // encima esconde el problema real.
    const otra = { code: 'PGRST204', message: "Could not find the 'comuna' column of 'pets'" };
    expect(esColumnaFaltante(otra, 'ambito')).toBe(false);
  });

  it('no se traga cualquier error que mencione la columna', () => {
    // El nombre aparece, pero el motivo es otro (un check constraint).
    const check = { code: '23514', message: 'violates check constraint "pets_ambito_valido"' };
    expect(esColumnaFaltante(check, 'ambito')).toBe(false);
    expect(esColumnaFaltante(null, 'ambito')).toBe(false);
    expect(esColumnaFaltante({ message: 'Failed to fetch' }, 'ambito')).toBe(false);
  });
});
