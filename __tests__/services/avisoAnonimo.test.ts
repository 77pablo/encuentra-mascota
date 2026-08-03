import { avisarSinCuenta, CORREO_INVALIDO, TOPE_NOTA } from '../../src/services/avisoAnonimo';
import { ErrorAmigable } from '../../src/lib/dbErrors';

// AVISAR SIN CUENTA (migración 0050).
//
// Lo llama quien se topó con el animal en la calle: un desconocido, sin sesión,
// parado en la vereda. Las tres cosas que este archivo protege:
//   1. La coordenada EXACTA no sale nunca del teléfono (difuminado, igual que
//      createPet/addSighting). Es el punto donde está parada esa persona.
//   2. Si la migración no está aplicada, NO se le miente diciendo que avisamos.
//   3. Un error de permisos o de red no se traga: se propaga para que la
//      pantalla lo muestre y se pueda reintentar.

const mockRpc = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

const PET = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

/** Los argumentos con los que se llamó a la RPC. */
function argumentos() {
  expect(mockRpc).toHaveBeenCalledTimes(1);
  const [nombre, args] = mockRpc.mock.calls[0];
  expect(nombre).toBe('avistar_sin_cuenta');
  return args;
}

describe('avisarSinCuenta — la ubicación', () => {
  it('difumina el punto: la coordenada exacta no se manda nunca', async () => {
    await avisarSinCuenta(PET, { lat: -33.45, lng: -70.66 });

    const args = argumentos();
    expect(args.p_lat).not.toBe(-33.45);
    expect(args.p_lng).not.toBe(-70.66);
    // Movido, pero no a otro barrio: el aviso tiene que seguir sirviendo para
    // salir a buscar. ~250 m son menos de 0,01 grados.
    expect(Math.abs(args.p_lat - -33.45)).toBeLessThan(0.01);
    expect(Math.abs(args.p_lng - -70.66)).toBeLessThan(0.01);
  });

  it('sin ubicación manda null, no un punto inventado', async () => {
    await avisarSinCuenta(PET, { nota: 'la tengo conmigo' });

    const args = argumentos();
    expect(args.p_lat).toBeNull();
    expect(args.p_lng).toBeNull();
  });

  it('media coordenada es ninguna coordenada', async () => {
    // Si llegara solo la latitud (permiso a medias, lectura de GPS cortada), un
    // punto con lng = null o 0 pone el pin en el Golfo de Guinea. Mejor sin pin.
    await avisarSinCuenta(PET, { lat: -33.45 });

    const args = argumentos();
    expect(args.p_lat).toBeNull();
    expect(args.p_lng).toBeNull();
  });

  it('un NaN tampoco pasa por coordenada', async () => {
    await avisarSinCuenta(PET, { lat: Number.NaN, lng: -70.66 });

    const args = argumentos();
    expect(args.p_lat).toBeNull();
    expect(args.p_lng).toBeNull();
  });
});

describe('avisarSinCuenta — la nota', () => {
  it('manda el id del reporte y la nota recortada', async () => {
    await avisarSinCuenta(PET, { nota: '  está en la plaza, tranquila  ' });

    const args = argumentos();
    expect(args.p_pet_id).toBe(PET);
    expect(args.p_nota).toBe('está en la plaza, tranquila');
  });

  it('corta una nota larguísima en el tope', async () => {
    await avisarSinCuenta(PET, { nota: 'a'.repeat(TOPE_NOTA + 300) });

    expect(argumentos().p_nota).toHaveLength(TOPE_NOTA);
  });

  it('una nota vacía o de puros espacios viaja como null', async () => {
    await avisarSinCuenta(PET, { nota: '   ' });

    expect(argumentos().p_nota).toBeNull();
  });
});

describe('avisarSinCuenta — el correo (D3, sobre la 0055/0061)', () => {
  it('manda p_correo normalizado cuando viene', async () => {
    await avisarSinCuenta(PET, { nota: '', correo: '  Vecino@Mail.CL ' });

    expect(argumentos().p_correo).toBe('vecino@mail.cl');
  });

  it('sin correo manda null, como siempre', async () => {
    await avisarSinCuenta(PET, { nota: 'hola' });

    expect(argumentos().p_correo).toBeNull();
  });

  it('un correo inválido corta ANTES de llamar, con mensaje amigable', async () => {
    await expect(avisarSinCuenta(PET, { correo: 'no-es-un-correo' })).rejects.toThrow(CORREO_INVALIDO);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('avisarSinCuenta — cuando algo falla', () => {
  it('sin la migración aplicada avisa que no se pudo, no finge que salió', async () => {
    // El dueño sube la web antes de correr el SQL. Tragarse el PGRST202 y
    // resolver como si nada dejaría a la persona yéndose a su casa creyendo que
    // la familia ya sabe. Es el peor final posible de este flujo.
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });

    await expect(avisarSinCuenta(PET, {})).rejects.toBeInstanceOf(ErrorAmigable);
    await expect(avisarSinCuenta(PET, {})).rejects.toThrow(/no pudimos avisar/i);
  });

  it('cualquier otro error se propaga tal cual', async () => {
    // Un corte de red o un rechazo de permisos NO son "la migración no está":
    // si se tragaran, el botón diría "listo" sin haber hecho nada.
    const crudo = { code: '42501', message: 'permission denied' };
    mockRpc.mockResolvedValue({ data: null, error: crudo });

    await expect(avisarSinCuenta(PET, {})).rejects.toEqual(crudo);
  });

  it('cuando sale bien, resuelve sin devolver nada', async () => {
    await expect(avisarSinCuenta(PET, { nota: 'ok' })).resolves.toBeUndefined();
  });
});
