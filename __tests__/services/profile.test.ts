import { camposDeContactoParaGuardar, getMyProfile, updateMyProfile } from '../../src/services/profile';

// Builder falso encadenable (select/update/eq son chainable, el resultado
// final se resuelve al hacer `await`, `.single()` o `.maybeSingle()`).
function makeQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe('getMyProfile', () => {
  it('pide la RPC sin pasarle ningun id', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'u1', nombre: 'Pablo', telefono: '+569' }], error: null });

    const perfil = await getMyProfile();

    expect(mockRpc).toHaveBeenCalledWith('mi_perfil');
    expect(mockRpc.mock.calls[0].length).toBe(1); // sin argumentos: el servidor decide de quien es la fila
    expect(perfil?.telefono).toBe('+569');
  });

  it('devuelve null si la RPC no trae filas', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await getMyProfile()).toBeNull();
  });

  // Mientras la app nueva este arriba y la migracion 0018 todavia no, la RPC no
  // existe. Sin este escalon nadie veria su perfil en esa ventana.
  it('si la RPC no existe todavia, cae al select de siempre', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });
    const builder = makeQueryBuilder({ data: { id: 'u1', nombre: 'Pablo' }, error: null });
    mockFrom.mockReturnValue(builder);

    const perfil = await getMyProfile('u1');

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.eq).toHaveBeenCalledWith('id', 'u1');
    expect(perfil?.nombre).toBe('Pablo');
    // Este escalon no puede leer telefono/red_social: tiene que marcar el
    // perfil como degradado para que quien lo consuma (ProfileScreen) sepa
    // que null aca significa "no se pudo leer", no "el usuario lo borro".
    expect(perfil?.contactoNoDisponible).toBe(true);
  });

  // Sin userIdRespaldo no hay a quien pedirle la fila en el escalon de
  // respaldo: tiene que propagar el error de la RPC, no devolver null en
  // silencio (eso dejaria al usuario pensando que no tiene perfil).
  it('si la RPC no existe todavia y no hay userIdRespaldo, propaga el error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } });

    await expect(getMyProfile()).rejects.toMatchObject({ code: 'PGRST202' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propaga los errores que no son "la RPC no existe"', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(getMyProfile()).rejects.toMatchObject({ code: '42501' });
  });
});

describe('updateMyProfile', () => {
  it('llama a update(fields).eq(id) sobre la tabla profiles', async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    await updateMyProfile('user-1', { nombre: 'Nuevo Nombre' });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(builder.update).toHaveBeenCalledWith({ nombre: 'Nuevo Nombre' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('lanza el error cuando supabase falla', async () => {
    const builder = makeQueryBuilder({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);

    await expect(updateMyProfile('user-1', { nombre: 'x' })).rejects.toEqual({ message: 'boom' });
  });
});

// Bug critico que motiva esta suite: cuando mi_perfil() no esta disponible
// (ventana de despliegue), getMyProfile cae al escalon de respaldo, que no
// puede leer telefono/red_social y devuelve null en esas columnas. Si
// ProfileScreen editara ese perfil y mandara los drafts (sembrados con esos
// null -> '') tal cual, el guardado borraria en silencio el contacto real
// del usuario, porque supabase-js no falla al hacer update sin .select().
// camposDeContactoParaGuardar es la funcion pura que decide que mandar, para
// poder probar la decision sin tener que renderizar la pantalla.
describe('camposDeContactoParaGuardar', () => {
  it('perfil normal: manda telefono y red_social tal como los escribio el usuario', () => {
    const perfil = { id: 'u1', nombre: 'Pablo', foto_perfil: null, telefono: '+569', red_social: '@pablo', creado_en: '' };
    expect(camposDeContactoParaGuardar(perfil, '+56911112222', '@nuevo')).toEqual({
      telefono: '+56911112222',
      red_social: '@nuevo',
    });
  });

  it('perfil degradado (contactoNoDisponible): no manda ni telefono ni red_social, aunque haya texto en los drafts', () => {
    const perfilDegradado = {
      id: 'u1',
      nombre: 'Pablo',
      foto_perfil: null,
      telefono: null,
      red_social: null,
      creado_en: '',
      contactoNoDisponible: true as const,
    };

    // Si el bug estuviera presente, esto devolveria { telefono: '', red_social: '' }
    // y guardarPerfil() escribiria un borrado silencioso encima del dato real.
    const campos = camposDeContactoParaGuardar(perfilDegradado, '', '');

    expect(campos).not.toHaveProperty('telefono');
    expect(campos).not.toHaveProperty('red_social');
    expect(campos).toEqual({});
  });

  it('perfil null (nunca cargo): manda los drafts igual, no hay nada degradado que proteger', () => {
    expect(camposDeContactoParaGuardar(null, '+569', '@x')).toEqual({ telefono: '+569', red_social: '@x' });
  });
});
