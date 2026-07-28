import { barrerFotosRetiradas, retirar } from '../../src/services/moderacionAdmin';

// EL RETIRO SOBREVIVE A UN FALLO DE STORAGE.
//
// Borrar la foto del bucket es best-effort: lo importante es que el contenido
// se retire. Pero "best-effort" no puede significar mudo —un `.catch(() => {})`
// fue lo que escondio que `send-push` ni siquiera estaba desplegada—, asi que
// el fallo tiene que (a) no romper el retiro, (b) quedar en el log y (c)
// volver como `fotoPendiente: true` para que la pantalla lo diga.

const mockRpc = jest.fn();
const mockInvoke = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
  },
}));

let errores: jest.SpyInstance;

beforeEach(() => {
  mockRpc.mockReset();
  mockInvoke.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
  errores = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errores.mockRestore();
});

describe('retirar: cuando hay foto que barrer y cuando no', () => {
  it('retira y barre la foto para una denuncia de mensaje', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, borradas: 1, pendientes: 0 }, error: null });

    await expect(retirar('d1', 'mensaje')).resolves.toEqual({ fotoPendiente: false });

    expect(mockRpc).toHaveBeenCalledWith('moderar_retirar', { p_denuncia_id: 'd1' });
    expect(mockInvoke).toHaveBeenCalledWith('moderar-borrar-foto', {
      body: { denunciaId: 'd1' },
    });
  });

  it('NO manda ninguna ruta: el cliente solo elige de que denuncia se habla', () => {
    // La Edge Function corre con service_role y se saltea la RLS de Storage.
    // Si el cuerpo llevara una ruta, quien modera (o cualquiera con su token)
    // podria borrarle un archivo a cualquier persona.
    mockInvoke.mockResolvedValue({ data: { ok: true, pendientes: 0 }, error: null });
    return retirar('d1', 'mensaje').then(() => {
      const [, opciones] = mockInvoke.mock.calls[0];
      expect(Object.keys(opciones.body)).toEqual(['denunciaId']);
      expect(JSON.stringify(opciones.body)).not.toMatch(/ruta|path|jpg|pet-photos/);
    });
  });

  it('no invoca nada para los tipos que no dejan foto huerfana', async () => {
    // Reportes y adopciones se OCULTAN (conservan sus fotos a proposito); las
    // pistas y preguntas no tienen imagen.
    for (const tipo of ['reporte', 'adopcion', 'pista', 'pregunta_adopcion', 'avistamiento']) {
      await expect(retirar('d1', tipo)).resolves.toEqual({ fotoPendiente: false });
    }
    await expect(retirar('d1')).resolves.toEqual({ fotoPendiente: false });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('si el RPC de retiro falla, lanza y no intenta barrer nada', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'no autorizado' } });
    await expect(retirar('d1', 'mensaje')).rejects.toMatchObject({ code: '42501' });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('el retiro NO se cae si falla el borrado de la foto', () => {
  it('la Edge Function devuelve error → retiro ok, fotoPendiente y log', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(retirar('d1', 'mensaje')).resolves.toEqual({ fotoPendiente: true });
    expect(errores).toHaveBeenCalled();
  });

  it('la Edge Function no esta desplegada (invoke lanza) → retiro ok y log', async () => {
    // Este es el caso que ya nos paso con `send-push`: la app llamaba a una
    // funcion inexistente y nadie se entero.
    mockInvoke.mockRejectedValue(new Error('Function not found'));
    await expect(retirar('d1', 'mensaje')).resolves.toEqual({ fotoPendiente: true });
    expect(errores).toHaveBeenCalled();
  });

  it('responde 200 pero con fotos sin confirmar (borrado parcial) → fotoPendiente', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, borradas: 1, pendientes: 2 }, error: null });
    await expect(retirar('d1', 'mensaje')).resolves.toEqual({ fotoPendiente: true });
    expect(errores).toHaveBeenCalledWith(expect.stringContaining('2'));
  });

  it('responde algo que no es `ok` → no se toma como exito', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'No autorizado' }, error: null });
    await expect(retirar('d1', 'mensaje')).resolves.toEqual({ fotoPendiente: true });
    expect(errores).toHaveBeenCalled();
  });
});

describe('barrerFotosRetiradas por si sola', () => {
  it('devuelve true solo cuando la funcion confirma que no quedo nada', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, borradas: 3, pendientes: 0 }, error: null });
    await expect(barrerFotosRetiradas('d9')).resolves.toBe(true);
    expect(errores).not.toHaveBeenCalled();
  });

  it('nunca lanza: es best-effort', async () => {
    mockInvoke.mockRejectedValue(new Error('red caida'));
    await expect(barrerFotosRetiradas('d9')).resolves.toBe(false);
  });
});
