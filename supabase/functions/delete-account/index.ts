import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// BORRAR MI CUENTA
//
// Orquesta el borrado en un orden que NO se puede alterar:
//
//   1. la RPC anonimiza los datos (en una transaccion) y devuelve las fotos
//   2. se borran las fotos de Storage
//   3. RECIEN AHI se borra el usuario de auth.users
//
// El paso 3 va ultimo porque borra el token con el que estamos trabajando: si
// fuera primero, no podriamos completar nada de lo anterior.
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

  try {
    // 1. Anonimizar (transaccional). Devuelve las rutas de las fotos huerfanas.
    const { data: rutas, error: rpcError } = await callerClient.rpc('anonimizar_mi_cuenta');
    if (rpcError) throw new Error(`anonimizar_mi_cuenta fallo: ${rpcError.message}`);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 2. Borrar las fotos. Si esto falla no perdemos nada recuperable: las
    // rutas empiezan con <user_id>/, asi que siempre se pueden barrer despues.
    const paths = ((rutas ?? []) as Array<{ ruta: string }>)
      .map((r) => r.ruta)
      .filter((r) => typeof r === 'string' && r.length > 0);
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from('pet-photos').remove(paths);
      if (storageError) throw new Error(`no se pudieron borrar las fotos: ${storageError.message}`);
    }

    // 3. Borrar el usuario de Auth. ULTIMO.
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
