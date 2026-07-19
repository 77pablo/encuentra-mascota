import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// BORRAR MI CUENTA
//
// Orquesta el borrado en un orden que NO se puede alterar:
//
//   1. se pregunta que fotos hay que borrar (solo lectura)
//   2. se borran las fotos de Storage
//   3. se anonimizan los datos (transaccional)
//   4. RECIEN AHI se borra el usuario de auth.users
//
// El paso 4 va ultimo porque borra el token con el que estamos trabajando: si
// fuera primero, no podriamos completar nada de lo anterior.
//
// Y la consulta de fotos va PRIMERO, separada de la anonimizacion, porque la
// anonimizacion es idempotente: si estuvieran juntas y fallara Storage, el
// reintento no volveria a ver las rutas y las fotos quedarian para siempre en
// un bucket publico mientras le decimos a la persona que ya se borraron.
// Asi, un fallo antes del paso 3 no deja rastro y el reintento arranca limpio.
//
// Y es el paso 3 el que hace que esto sea irreversible de verdad: lo que queda
// en la base es un uuid al azar, y el correo que lo ataba a una persona
// desaparece. Ademas libera el correo para que pueda registrarse de nuevo.

const HEADERS_BASE = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

function origenesPermitidos(): string[] {
  const web = Deno.env.get('EXPO_PUBLIC_WEB_URL');
  return web ? [web.replace(/\/$/, ''), ...ORIGENES_DEV] : ORIGENES_DEV;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req.headers.get('Origin'), origenesPermitidos());
  const HEADERS = { ...HEADERS_BASE, ...cors };

  // El preflight se contesta antes de tocar nada: el navegador lo manda sin
  // credenciales y el gateway lo deja pasar sin verificar el JWT.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...HEADERS, Allow: 'POST, OPTIONS' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }

  // Cliente "anon + JWT del llamador". La RPC se invoca con ESTE cliente, no
  // con service_role: adentro usa auth.uid(), asi que necesita el token real
  // de la persona. Es lo que garantiza que solo se borre a si misma.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }
  const userId = userData.user.id;

  // El cliente con service_role se arma ANTES del try: si faltara la variable
  // de entorno, queremos enterarnos ahora y no despues de haber anonimizado
  // (eso dejaria la cuenta en estado lapida por un error de configuracion).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1. Preguntar que fotos hay que borrar. Solo lectura: todavia no se
    //    modifico nada, asi que si algo falla aca no quedo nada a medias.
    const { data: rutas, error: rpcError } = await callerClient.rpc('mis_fotos_a_borrar');
    if (rpcError) throw new Error(`mis_fotos_a_borrar fallo: ${rpcError.message}`);

    // `returns table (ruta text)` llega por PostgREST como arreglo de objetos.
    // Si alguien cambiara la firma de la RPC esto dejaria de coincidir, y como
    // este archivo no lo revisa ningun typecheck, preferimos gritar antes que
    // borrar cero fotos en silencio.
    if (!Array.isArray(rutas)) {
      throw new Error('mis_fotos_a_borrar no devolvio un arreglo');
    }
    const paths = (rutas as Array<{ ruta: unknown }>).map((r) => r.ruta);
    if (!paths.every((r) => typeof r === 'string' && r.length > 0)) {
      throw new Error('mis_fotos_a_borrar devolvio una ruta que no es texto');
    }

    // Segunda barrera del mismo filtro que ya aplica la RPC. Es a proposito:
    // este `remove` corre con service_role y se saltea la RLS de Storage, y las
    // rutas nacen de columnas que escribe el usuario. Si alguna vez la RPC
    // cambia y pierde su filtro, esto evita que le borremos las fotos a otra
    // persona. Las dos capas tienen que fallar para que haya dano.
    const prefijo = `${userId}/`;
    const propias = (paths as string[]).filter((p) => p.startsWith(prefijo));

    // 2. Borrar las fotos. Todavia no se anonimizo: si esto falla, el reintento
    //    empieza de cero y vuelve a pedir la lista completa.
    if (propias.length > 0) {
      const { error: storageError } = await admin.storage.from('pet-photos').remove(propias);
      if (storageError) throw new Error(`no se pudieron borrar las fotos: ${storageError.message}`);
    }

    // 3. Anonimizar los datos (transaccional e idempotente).
    const { error: anonError } = await callerClient.rpc('anonimizar_mi_cuenta');
    if (anonError) throw new Error(`anonimizar_mi_cuenta fallo: ${anonError.message}`);

    // 4. Borrar el usuario de Auth. ULTIMO: borra el token con el que venimos
    //    trabajando, y es lo que hace irreversible la anonimizacion.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`no se pudo borrar el usuario: ${authError.message}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
  } catch (e) {
    // No devolvemos exito a medias: si los datos ya se anonimizaron pero el
    // usuario de Auth sigue vivo, decir "listo" dejaria a la persona pudiendo
    // entrar a una cuenta lapida. Reintentar completa el resto, porque la RPC
    // es idempotente.
    console.error('error en delete-account', e);
    return new Response(
      JSON.stringify({ error: 'No se pudo completar el borrado. Intentá de nuevo.' }),
      { status: 500, headers: HEADERS },
    );
  }
});
