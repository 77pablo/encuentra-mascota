import { misAvisos } from '../../src/services/avisos';
import { esMigracionSinAplicar } from '../../src/lib/dbErrors';

// EL CLIENTE DE `mis_avisos()` (migración 0051).
//
// Dos cosas se prueban acá y las dos ya se rompieron en este repo:
//
//   1. QUE NO SE PUEDA PEDIR LA COLA DE OTRA PERSONA. La mitad servidor de esa
//      garantía vive en __tests__/db/migracion0051.test.ts (la RPC no tiene
//      parámetro de identidad). Esta es la mitad cliente: que el llamado no
//      mande ningún user_id, ni ahora ni cuando alguien "agregue el parámetro
//      que falta" copiando de `perfil_publico(p_user_id)`.
//   2. QUE UN FALLO SE PROPAGUE. Devolver `[]` cuando la lectura falla es el
//      bug que ya apareció cuatro veces (AlertZone, MisBusquedas, Perfil,
//      Moderación): la persona lee "no tenés avisos" cuando en realidad no se
//      pudo preguntar.

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (...a: any[]) => mockRpc(...a),
    from: (...a: any[]) => mockFrom(...a),
  },
}));

const FILA = {
  id: 'e1',
  tipo: 'coincidencia',
  pet_id: 'p1',
  datos: { match_estado: 'encontrada' },
  creado_en: '2026-08-01T10:00:00Z',
};

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: [FILA], error: null });
  mockFrom.mockReset();
});

describe('misAvisos pregunta por la RPC y por nada más', () => {
  it('llama a `mis_avisos`', async () => {
    await misAvisos();
    expect(mockRpc.mock.calls[0][0]).toBe('mis_avisos');
  });

  it('NUNCA toca la tabla `notification_events` de forma directa', () => {
    // La tabla no tiene RLS pública: un `.from('notification_events')` no
    // devolvería nada y, peor, sugeriría que se puede leer así.
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'src', 'services', 'avisos.ts'),
      'utf8',
    );
    expect(fuente).not.toContain("from('notification_events')");
  });

  it('NO manda ningún parámetro de identidad: solo el tope', async () => {
    // El guardián del lado cliente. Si mañana alguien agrega `p_user_id`, este
    // test se pone rojo antes de que llegue a la base.
    await misAvisos();
    const params = mockRpc.mock.calls[0][1] ?? {};
    expect(Object.keys(params).sort()).toEqual(['p_limite']);
  });

  it('el tope viaja como número, y se puede pedir menos', async () => {
    await misAvisos(10);
    expect(mockRpc.mock.calls[0][1]).toEqual({ p_limite: 10 });
  });
});

describe('misAvisos NO se come los errores', () => {
  it('un corte de red se propaga (no devuelve una lista vacía)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await expect(misAvisos()).rejects.toBeTruthy();
  });

  it('la migración sin aplicar también se propaga, y se reconoce como tal', async () => {
    // PGRST202 = la función no existe todavía. Se propaga igual que el resto:
    // la pantalla decide qué decir. Lo que NO puede pasar es que se traduzca a
    // "no tenés avisos".
    const pgrst202 = { code: 'PGRST202', message: 'Could not find the function public.mis_avisos' };
    mockRpc.mockResolvedValue({ data: null, error: pgrst202 });
    await expect(misAvisos()).rejects.toMatchObject({ code: 'PGRST202' });
    expect(esMigracionSinAplicar(pgrst202)).toBe(true);
  });
});

describe('misAvisos normaliza lo que llega de la cola', () => {
  it('devuelve las filas tal cual vienen', async () => {
    const avisos = await misAvisos();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].id).toBe('e1');
    expect(avisos[0].datos).toEqual({ match_estado: 'encontrada' });
  });

  it('una cola vacía de verdad son cero avisos, sin error', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await misAvisos()).toEqual([]);
  });

  it('`data` en null (sin error) son cero avisos y no rompe', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await misAvisos()).toEqual([]);
  });

  it('`datos` en null se vuelve un objeto vacío (la pantalla lo indexa)', async () => {
    // Sin esto, `textoDeAviso` explota con "cannot read properties of null" y se
    // cae la bandeja entera por una fila mal encolada.
    mockRpc.mockResolvedValue({ data: [{ ...FILA, datos: null }], error: null });
    expect((await misAvisos())[0].datos).toEqual({});
  });
});
