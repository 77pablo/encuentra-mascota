// Borrar un avistamiento tiene que FALLAR RUIDOSAMENTE cuando no borró nada.
//
// Cuando la RLS rechaza un delete, PostgREST NO devuelve error: simplemente
// borra 0 filas y responde 204. `borrarTip` ya se había arreglado por esto
// (`src/services/tips.ts`), pero su gemelo `deleteSighting` nació sin la
// guarda, y la pantalla hace una baja OPTIMISTA: sacaba el avistamiento de la
// lista, no mostraba ningún aviso, y el dato seguía ahí para todo el mundo.
//
// El caso real que lo dispara no es raro: la app quedó abierta desde ayer, el
// refresh del token falló, y la sesión pasó a `anon`. La política de la 0007 es
// `for delete to authenticated`, así que con rol anon no hay política aplicable
// → 0 filas, sin error.

const mockSelect = jest.fn((..._a: any[]) => Promise.resolve({ data: [] as any, error: null as any }));
const mockEq = jest.fn((..._a: any[]) => ({ select: (c?: string) => mockSelect(c) }));
const mockDelete = jest.fn(() => ({ eq: (col: string, val: string) => mockEq(col, val) }));
const mockFrom = jest.fn((_tabla: string) => ({ delete: () => mockDelete() }));

jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: (tabla: string) => mockFrom(tabla) },
}));
jest.mock('../../src/services/bloqueos', () => ({
  idsBloqueados: jest.fn(async () => []),
  filtrarBloqueados: (filas: any[]) => filas,
}));

import { deleteSighting } from '../../src/services/sightings';
import { ErrorAmigable } from '../../src/lib/dbErrors';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteSighting', () => {
  it('pide las filas borradas, no confía en la ausencia de error', async () => {
    mockSelect.mockResolvedValueOnce({ data: [{ id: 'av-1' }], error: null });
    await deleteSighting('av-1');
    // Sin este `.select()`, PostgREST no dice cuántas filas tocó.
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('sightings');
  });

  it('cuando la RLS rechaza el borrado (0 filas, SIN error) lanza', async () => {
    mockSelect.mockResolvedValueOnce({ data: [], error: null });
    await expect(deleteSighting('av-de-otro')).rejects.toBeInstanceOf(ErrorAmigable);
  });

  it('también lanza si PostgREST devuelve data null', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteSighting('av-1')).rejects.toThrow();
  });

  it('propaga el error de verdad cuando lo hay', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'se cayó la red' } });
    await expect(deleteSighting('av-1')).rejects.toEqual({ message: 'se cayó la red' });
  });

  it('no lanza cuando sí borró', async () => {
    mockSelect.mockResolvedValueOnce({ data: [{ id: 'av-1' }], error: null });
    await expect(deleteSighting('av-1')).resolves.toBeUndefined();
  });
});
