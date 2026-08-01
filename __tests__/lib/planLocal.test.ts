// Almacenamiento LOCAL del plan de búsqueda: qué pasos ya hizo el dueño y qué
// nos dijo del carácter/ámbito de su mascota. Es una ayuda para él, en su
// teléfono; no es dato compartido ni sensible, así que NO hay migración ni
// columna nueva (mismo patrón que src/lib/onboarding.ts y temaPref.ts).

const mem: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (k in mem ? mem[k] : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mem[k] = v;
  }),
}));

import { PASOS_PLAN } from '../../src/lib/planBusqueda';
import {
  CLAVE_PLAN,
  getEstadoPlan,
  setPasoHecho,
  setPerfilPlan,
} from '../../src/lib/planLocal';

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

describe('el progreso del plan', () => {
  it('arranca vacío y sin suponerle nada a la mascota', async () => {
    const estado = await getEstadoPlan('pet-1');
    expect(estado.hechos).toEqual([]);
    expect(estado.temperamento).toBeUndefined();
    expect(estado.ambito).toBeUndefined();
  });

  it('marca y desmarca un paso, y sobrevive a releerlo', async () => {
    await setPasoHecho('pet-1', 'olor-en-la-puerta', true);
    expect((await getEstadoPlan('pet-1')).hechos).toEqual(['olor-en-la-puerta']);

    await setPasoHecho('pet-1', 'punto-exacto-de-perdida', true);
    expect((await getEstadoPlan('pet-1')).hechos.sort()).toEqual([
      'olor-en-la-puerta',
      'punto-exacto-de-perdida',
    ]);

    await setPasoHecho('pet-1', 'olor-en-la-puerta', false);
    expect((await getEstadoPlan('pet-1')).hechos).toEqual(['punto-exacto-de-perdida']);
  });

  it('marcar dos veces el mismo paso no lo duplica', async () => {
    await setPasoHecho('pet-1', 'olor-en-la-puerta', true);
    await setPasoHecho('pet-1', 'olor-en-la-puerta', true);
    expect((await getEstadoPlan('pet-1')).hechos).toEqual(['olor-en-la-puerta']);
  });

  it('cada reporte lleva su propio progreso', async () => {
    // Alguien puede tener dos búsquedas abiertas a la vez. Si compartieran
    // clave, marcar un paso en una tacharía el de la otra.
    await setPasoHecho('pet-1', 'olor-en-la-puerta', true);
    expect((await getEstadoPlan('pet-2')).hechos).toEqual([]);
    expect(CLAVE_PLAN('pet-1')).not.toBe(CLAVE_PLAN('pet-2'));
    expect(CLAVE_PLAN('pet-1')).toContain('pet-1');
  });

  it('descarta ids que no son pasos del plan', async () => {
    mem[CLAVE_PLAN('pet-1')] = JSON.stringify({
      hechos: ['olor-en-la-puerta', 'lo-que-sea', '<script>'],
    });
    expect((await getEstadoPlan('pet-1')).hechos).toEqual(['olor-en-la-puerta']);
  });

  it('un dato corrupto no rompe nada: vuelve el plan vacío', async () => {
    mem[CLAVE_PLAN('pet-1')] = 'esto no es json';
    await expect(getEstadoPlan('pet-1')).resolves.toEqual({ hechos: [] });

    mem[CLAVE_PLAN('pet-1')] = JSON.stringify({ hechos: 'no-es-una-lista' });
    expect((await getEstadoPlan('pet-1')).hechos).toEqual([]);
  });
});

describe('lo que el dueño nos cuenta de su mascota', () => {
  it('guarda el temperamento y el ámbito, y los devuelve', async () => {
    await setPerfilPlan('pet-1', { temperamento: 'sociable' });
    expect((await getEstadoPlan('pet-1')).temperamento).toBe('sociable');

    await setPerfilPlan('pet-1', { ambito: 'exterior' });
    const estado = await getEstadoPlan('pet-1');
    expect(estado.ambito).toBe('exterior');
    // guardar el ámbito no puede borrar lo que ya nos habían dicho
    expect(estado.temperamento).toBe('sociable');
  });

  it('no pisa el progreso ya marcado', async () => {
    await setPasoHecho('pet-1', 'olor-en-la-puerta', true);
    await setPerfilPlan('pet-1', { temperamento: 'asustadizo' });
    expect((await getEstadoPlan('pet-1')).hechos).toEqual(['olor-en-la-puerta']);
  });

  it('un valor inventado en el almacenamiento se ignora', async () => {
    mem[CLAVE_PLAN('pet-1')] = JSON.stringify({
      hechos: [],
      temperamento: 'furioso',
      ambito: 'submarino',
    });
    const estado = await getEstadoPlan('pet-1');
    expect(estado.temperamento).toBeUndefined();
    expect(estado.ambito).toBeUndefined();
  });
});

describe('sin almacenamiento la app sigue andando', () => {
  it('si leer explota, devuelve el plan vacío en vez de tirar la pantalla', async () => {
    const original = (global as any).localStorage;
    (global as any).localStorage = {
      getItem: () => {
        throw new Error('modo incógnito');
      },
      setItem: () => {
        throw new Error('modo incógnito');
      },
    };
    try {
      await expect(getEstadoPlan('pet-1')).resolves.toEqual({ hechos: [] });
      await expect(setPasoHecho('pet-1', 'olor-en-la-puerta', true)).resolves.toBeDefined();
    } finally {
      (global as any).localStorage = original;
    }
  });
});

describe('los ids que se guardan son los del plan de verdad', () => {
  it('todo id aceptado sale del catálogo (el test no inventa la lista)', async () => {
    const delCatalogo = PASOS_PLAN.map((p) => p.id);
    expect(delCatalogo).toContain('olor-en-la-puerta');
    mem[CLAVE_PLAN('pet-9')] = JSON.stringify({ hechos: delCatalogo });
    const guardados = (await getEstadoPlan('pet-9')).hechos;
    expect(guardados.sort()).toEqual([...delCatalogo].sort());
  });
});
