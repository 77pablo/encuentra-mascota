import { listarTodoElPrefijo } from '../../src/lib/rutaStorage';

// `storage.list` de Supabase devuelve como maximo 100 filas por llamada.
// `listarTodoElPrefijo` (D3, tanda 14) pagina hasta traer todo el prefijo:
// sin esto, un reporte con mas de 100 fotos de aviso anonimo dejaba huerfanos
// inaccesibles al borrarse (deuda anotada en la tarea D5 de la tanda 13).
const mockList = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        list: (...args: any[]) => mockList(bucket, ...args),
      }),
    },
  },
}));

beforeEach(() => {
  mockList.mockReset();
});

describe('listarTodoElPrefijo', () => {
  it('pagina hasta traer todo: con 250 archivos hace 3 vueltas', async () => {
    const pagina = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `f${i}.jpg` }));
    mockList
      .mockResolvedValueOnce({ data: pagina(100), error: null })
      .mockResolvedValueOnce({ data: pagina(100), error: null })
      .mockResolvedValueOnce({ data: pagina(50), error: null });

    const todos = await listarTodoElPrefijo('avisos-anonimos', 'pet-1');

    expect(todos).toHaveLength(250);
    expect(mockList).toHaveBeenCalledTimes(3);
  });

  it('una pagina vacia corta el bucle (no gira para siempre)', async () => {
    mockList.mockResolvedValueOnce({ data: [], error: null });

    const todos = await listarTodoElPrefijo('avisos-anonimos', 'pet-1');

    expect(todos).toEqual([]);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('arma la ruta completa como `<prefijo>/<nombre>` y pide bucket/limit/offset correctos', async () => {
    mockList.mockResolvedValueOnce({ data: [{ name: 'a.jpg' }], error: null });

    const todos = await listarTodoElPrefijo('avisos-anonimos', 'pet-1');

    expect(todos).toEqual(['pet-1/a.jpg']);
    expect(mockList).toHaveBeenCalledWith('avisos-anonimos', 'pet-1', { limit: 100, offset: 0 });
  });

  it('propaga el error de Storage en vez de tragarlo', async () => {
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

    await expect(listarTodoElPrefijo('avisos-anonimos', 'pet-1')).rejects.toEqual({ message: 'boom' });
  });
});
