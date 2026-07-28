import { readFileSync } from 'fs';
import { join } from 'path';
import {
  agruparPorRuta,
  clasificarBorrado,
  normalizarPendientes,
  rutaSegura,
} from '../../supabase/functions/_shared/barridoFotos';

// La logica del barrido vive en un modulo PURO (como `cors.ts`) justo para poder
// probarla acá: `index.ts` de una Edge Function no se puede importar desde jest
// (usa `Deno.serve` y especificadores `jsr:`). Lo que se prueba de verdad es el
// borrado parcial —el fallo que Storage NO reporta como error— y el filtro de
// rutas. El cableado del `index.ts` se cubre abajo leyendo el archivo.

const UID = '11111111-2222-3333-4444-555555555555';
const OTRO = '99999999-8888-7777-6666-555555555555';

describe('rutaSegura', () => {
  it('acepta la forma que genera la app: <uuid>/<archivo>', () => {
    expect(rutaSegura(`${UID}/1720000000000.jpg`)).toBe(true);
  });

  it('rechaza rutas con mas de un segmento despues del uid', () => {
    // `<miuid>/../<uid-ajeno>/foto.jpg` borraria la foto de otra persona si
    // Storage normalizara el `..`. No dependemos de esa suposicion.
    expect(rutaSegura(`${UID}/../${OTRO}/foto.jpg`)).toBe(false);
    expect(rutaSegura(`${UID}/sub/foto.jpg`)).toBe(false);
  });

  it('rechaza lo que no empieza con un uuid', () => {
    expect(rutaSegura('avatars/foto.jpg')).toBe(false);
    expect(rutaSegura('/etc/passwd')).toBe(false);
    expect(rutaSegura(`${UID}`)).toBe(false);
    expect(rutaSegura(`${UID}/`)).toBe(false);
  });

  it('rechaza lo que ni siquiera es texto', () => {
    expect(rutaSegura(null)).toBe(false);
    expect(rutaSegura(42)).toBe(false);
    expect(rutaSegura(undefined)).toBe(false);
  });
});

describe('normalizarPendientes', () => {
  it('acepta la forma de PostgREST para `returns table (id bigint, ruta text)`', () => {
    expect(normalizarPendientes([{ id: 7, ruta: `${UID}/a.jpg` }])).toEqual([
      { id: 7, ruta: `${UID}/a.jpg` },
    ]);
  });

  it('acepta un bigint que llega como texto', () => {
    expect(normalizarPendientes([{ id: '7', ruta: `${UID}/a.jpg` }])).toEqual([
      { id: 7, ruta: `${UID}/a.jpg` },
    ]);
  });

  it('grita si la RPC cambia de forma en vez de barrer cero fotos en silencio', () => {
    expect(() => normalizarPendientes(null)).toThrow(/no devolvio un arreglo/);
    expect(() => normalizarPendientes([{ ruta: `${UID}/a.jpg` }])).toThrow(/sin id numerico/);
    expect(() => normalizarPendientes([{ id: 1, ruta: 5 }])).toThrow(/no es texto/);
  });
});

describe('agruparPorRuta', () => {
  it('deduplica las rutas repetidas y se queda con todos sus ids', () => {
    // Sin deduplicar, Storage devolveria una fila para dos pedidos y el conteo
    // lo leeria como borrado parcial: esa foto se reintentaria hasta agotar los
    // intentos sin que nada estuviera fallando.
    const mapa = agruparPorRuta([
      { id: 1, ruta: `${UID}/a.jpg` },
      { id: 2, ruta: `${UID}/a.jpg` },
      { id: 3, ruta: `${UID}/b.jpg` },
    ]);
    expect([...mapa.keys()]).toEqual([`${UID}/a.jpg`, `${UID}/b.jpg`]);
    expect(mapa.get(`${UID}/a.jpg`)).toEqual([1, 2]);
  });
});

describe('clasificarBorrado — el borrado PARCIAL que Storage no reporta', () => {
  const nombre = (n: string) => ({ name: n });

  it('todo confirmado cuando vuelven todas las rutas', () => {
    const r = clasificarBorrado([`${UID}/a.jpg`, `${UID}/b.jpg`], [
      nombre(`${UID}/a.jpg`),
      nombre(`${UID}/b.jpg`),
    ]);
    expect(r.confirmadas).toEqual([`${UID}/a.jpg`, `${UID}/b.jpg`]);
    expect(r.noConfirmadas).toEqual([]);
    expect(r.formaInesperada).toBe(false);
  });

  it('detecta la que falta: `remove` no devuelve error por un borrado a medias', () => {
    const r = clasificarBorrado([`${UID}/a.jpg`, `${UID}/b.jpg`], [nombre(`${UID}/a.jpg`)]);
    expect(r.confirmadas).toEqual([`${UID}/a.jpg`]);
    expect(r.noConfirmadas).toEqual([`${UID}/b.jpg`]);
  });

  it('data vacia = nada confirmado (no se cierra la cola)', () => {
    const r = clasificarBorrado([`${UID}/a.jpg`], []);
    expect(r.confirmadas).toEqual([]);
    expect(r.noConfirmadas).toEqual([`${UID}/a.jpg`]);
  });

  it('data null (o de otro tipo) = nada confirmado', () => {
    expect(clasificarBorrado([`${UID}/a.jpg`], null).noConfirmadas).toEqual([`${UID}/a.jpg`]);
    expect(clasificarBorrado([`${UID}/a.jpg`], { name: 'x' }).noConfirmadas).toEqual([
      `${UID}/a.jpg`,
    ]);
  });

  it('no confunde una ruta ajena devuelta por Storage con la que se pidio', () => {
    const r = clasificarBorrado([`${UID}/a.jpg`, `${UID}/b.jpg`], [
      nombre(`${OTRO}/a.jpg`),
      nombre(`${UID}/b.jpg`),
    ]);
    expect(r.confirmadas).toEqual([`${UID}/b.jpg`]);
    expect(r.noConfirmadas).toEqual([`${UID}/a.jpg`]);
  });

  it('si cambia la forma de la respuesta pero vino la cantidad justa, avisa y no reintenta eterno', () => {
    const r = clasificarBorrado([`${UID}/a.jpg`], [{ path: `${UID}/a.jpg` } as any]);
    expect(r.formaInesperada).toBe(true);
    expect(r.confirmadas).toEqual([`${UID}/a.jpg`]);
    expect(r.noConfirmadas).toEqual([]);
  });

  it('sin rutas pedidas no inventa nada', () => {
    expect(clasificarBorrado([], [])).toEqual({
      confirmadas: [],
      noConfirmadas: [],
      formaInesperada: false,
    });
  });
});

// ---------------------------------------------------------------------------
// GUARDRAIL ESTATICO del `index.ts` de la Edge Function: el cableado.
// Lo que historicamente se rompio no fue la logica pura, fue el cableado (una
// funcion que ni siquiera consultaba lo que decia consultar).
const fn = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'functions', 'moderar-borrar-foto', 'index.ts'),
  'utf8',
);
const codigoFn = fn.replace(/\/\/[^\n]*/g, '');

describe('moderar-borrar-foto: cableado', () => {
  it('NO acepta rutas del cliente: del cuerpo solo sale `denunciaId`', () => {
    // Con service_role se saltea la RLS de Storage: una ruta elegida por quien
    // llama borraria el archivo de cualquiera (ya fue un Critical acá).
    const cuerpo = codigoFn.slice(codigoFn.indexOf('await req.json()'));
    const hastaLaRpc = cuerpo.slice(0, cuerpo.indexOf('moderacion_fotos_a_borrar'));
    expect(hastaLaRpc).toContain('denunciaId');
    expect(hastaLaRpc).not.toMatch(/cuerpo as \{[^}]*ruta/);
    expect(codigoFn).not.toMatch(/\.ruta(s)?\s*=\s*(cuerpo|body)/);
    // La unica llamada a remove usa las rutas derivadas de la RPC.
    expect(codigoFn).toContain('.remove(rutas)');
    expect(codigoFn.match(/\.remove\(/g) ?? []).toHaveLength(1);
  });

  it('valida que el id de denuncia sea un uuid antes de tocar la base', () => {
    expect(codigoFn).toContain('UUID.test(denunciaId)');
  });

  it('pide las rutas con el JWT del llamador, no con service_role', () => {
    // El gate `es_admin()` mira `auth.uid()`: con service_role no habria gate.
    expect(codigoFn).toContain("callerClient.rpc('moderacion_fotos_a_borrar'");
    expect(codigoFn).toContain("callerClient.rpc('moderacion_fotos_marcar'");
    expect(codigoFn).not.toMatch(/admin\.rpc\(/);
  });

  it('service_role se usa SOLO para Storage', () => {
    expect(codigoFn).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(codigoFn).toContain('admin.storage.from(BUCKET).remove');
    expect(codigoFn).not.toMatch(/admin\.from\(/);
  });

  it('devuelve 403 cuando la RPC contesta "no autorizado"', () => {
    expect(codigoFn).toContain("includes('no autorizado')");
    expect(codigoFn).toContain('status: 403');
  });

  it('cierra en la cola SOLO lo confirmado, y lo demas va como fallido', () => {
    expect(codigoFn).toContain('p_borradas: idsBorradas');
    expect(codigoFn).toContain('p_fallidas: idsFallidas');
    expect(codigoFn).toContain('idsDe(confirmadas)');
    expect(codigoFn).toContain('idsDe(noConfirmadas)');
  });

  it('el borrado parcial queda registrado (no se traga)', () => {
    expect(codigoFn).toMatch(/noConfirmadas\.length > 0[\s\S]{0,200}console\.error/);
  });

  it('CORS por allowlist: nunca `*`, y el preflight se contesta primero', () => {
    expect(codigoFn).toContain('cabecerasCors(');
    expect(codigoFn).toContain('ORIGENES_DEV');
    expect(codigoFn).not.toContain("'*'");
    expect(codigoFn.indexOf("req.method === 'OPTIONS'")).toBeLessThan(
      codigoFn.indexOf("req.method !== 'POST'"),
    );
  });

  it('exige Authorization y rechaza los metodos que no son POST', () => {
    expect(codigoFn).toContain("req.headers.get('Authorization')");
    expect(codigoFn).toContain('status: 401');
    expect(codigoFn).toContain('status: 405');
  });

  it('usa el mismo bucket que la app', () => {
    expect(codigoFn).toContain("const BUCKET = 'pet-photos'");
  });
});
