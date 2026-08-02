import {
  borrarFotosSubidas,
  esRechazoDefinitivo,
  estoySuspendido,
} from '../../src/services/storage';

// M-6: un usuario suspendido subía la foto al bucket y RECIÉN DESPUÉS la RLS
// (0036) le rechazaba el insert con 42501 → foto huérfana, repetible a
// voluntad. Estas piezas no son la defensa (esa es la RLS); son las que evitan
// la basura en el bucket y el mensaje confuso.

const mockRpc = jest.fn();
const mockRemove = jest.fn();
const mockStorageFrom = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    storage: {
      from: (...args: any[]) => {
        mockStorageFrom(...args);
        return { remove: (...rargs: any[]) => mockRemove(...rargs) };
      },
    },
  },
}));

const UID = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://proyecto.supabase.co/storage/v1/object/public/pet-photos';

let warn: jest.SpyInstance;

beforeEach(() => {
  mockRpc.mockReset();
  mockRemove.mockReset();
  mockStorageFrom.mockReset();
  mockRemove.mockResolvedValue({ data: [], error: null });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('estoySuspendido', () => {
  it('llama a la RPC estoy_suspendido y devuelve true si lo está', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    await expect(estoySuspendido()).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('estoy_suspendido');
  });

  it('devuelve false si no está suspendido', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    await expect(estoySuspendido()).resolves.toBe(false);
  });

  it('degrada a false si la RPC falla (base sin la 0036, red caída, sin permiso)', async () => {
    // En la duda dejamos publicar y decide la RLS: un `true` inventado por un
    // fallo de red le bloquearía la publicación a alguien que sí puede.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    await expect(estoySuspendido()).resolves.toBe(false);
  });

  it('no interpreta como suspensión una respuesta que no sea true', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(estoySuspendido()).resolves.toBe(false);
  });
});

describe('esRechazoDefinitivo', () => {
  it('reconoce el 42501 por código', () => {
    expect(esRechazoDefinitivo({ code: '42501', message: 'new row violates policy' })).toBe(true);
  });

  it('reconoce la violación de RLS por texto (PostgREST a veces no manda code)', () => {
    expect(esRechazoDefinitivo({ message: 'new row violates row-level security policy' })).toBe(true);
    expect(esRechazoDefinitivo({ message: 'permission denied for table pets' })).toBe(true);
  });

  it('NO trata como rechazo un error de red: ahí no sabemos si la fila entró', () => {
    // Es la razón de que el borrado sea solo para este caso. Borrar las fotos
    // de un reporte que sí se creó sería peor que dejar una huérfana.
    expect(esRechazoDefinitivo({ message: 'Failed to fetch' })).toBe(false);
    expect(esRechazoDefinitivo(new Error('Network request failed'))).toBe(false);
  });

  it('NO trata como rechazo una violación de constraint (el texto es otro)', () => {
    expect(esRechazoDefinitivo({ code: '23514', message: 'violates check constraint' })).toBe(false);
  });

  it('tolera null, undefined y strings sueltos', () => {
    expect(esRechazoDefinitivo(null)).toBe(false);
    expect(esRechazoDefinitivo(undefined)).toBe(false);
    expect(esRechazoDefinitivo('42501')).toBe(false);
  });
});

describe('borrarFotosSubidas', () => {
  it('borra del bucket las rutas de las fotos propias', async () => {
    await borrarFotosSubidas([`${BASE}/${UID}/a.jpg`, `${BASE}/${UID}/b.jpg`], UID);

    expect(mockStorageFrom).toHaveBeenCalledWith('pet-photos');
    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`, `${UID}/b.jpg`]);
  });

  it('deduplica rutas repetidas', async () => {
    await borrarFotosSubidas([`${BASE}/${UID}/a.jpg`, `${BASE}/${UID}/a.jpg`], UID);

    expect(mockRemove).toHaveBeenCalledWith([`${UID}/a.jpg`]);
  });

  it('nunca manda a Storage la foto de otra persona', async () => {
    await borrarFotosSubidas([`${BASE}/${OTRO}/a.jpg`], UID);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('con la lista vacía no toca Storage ni avisa', async () => {
    await borrarFotosSubidas([], UID);

    expect(mockRemove).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('si el borrado falla NO lanza: deja la huérfana pero avisa', async () => {
    // El que llama está en medio de propagar el error real de la publicación;
    // que este mejor-esfuerzo lo tape sería cambiar un problema por otro peor.
    mockRemove.mockResolvedValue({ data: null, error: { message: 'sin permiso' } });

    await expect(borrarFotosSubidas([`${BASE}/${UID}/a.jpg`], UID)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('si Storage tira una excepción tampoco lanza', async () => {
    mockRemove.mockRejectedValue(new Error('boom'));

    await expect(borrarFotosSubidas([`${BASE}/${UID}/a.jpg`], UID)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
