import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';
import {
  agruparPorRuta,
  clasificarBorrado,
  normalizarPendientes,
  rutaSegura,
} from '../_shared/barridoFotos.ts';

// BORRAR DEL BUCKET LAS FOTOS DE LOS MENSAJES RETIRADOS POR MODERACION
//
// Diferido I-2 de la tanda 8. `moderar_retirar` (0040) borra la fila del
// mensaje, pero desde SQL no se puede borrar un objeto de Storage: el archivo
// de `imagen_url` quedaba publico para siempre. La 0043 hace que el retiro
// ENCOLE la ruta (derivada en el servidor) y esta funcion la borra con
// service_role.
//
// LO QUE ESTA FUNCION NO ACEPTA: una ruta. El cuerpo trae unicamente el id de
// la denuncia. `messages.imagen_url` es texto que escribe el usuario y acá
// corremos con service_role, que se saltea la RLS de Storage: una ruta elegida
// por quien llama seria borrarle archivos a cualquiera (ya fue un Critical en
// este proyecto). Las rutas salen de la RPC, que las derivo del autor del
// mensaje retirado.
//
// AUTORIZACION: no se chequea acá. La RPC `moderacion_fotos_a_borrar` es
// security definer y aborta con "no autorizado" si `es_admin()` es falso, y se
// la invoca con el JWT de quien llama (nunca con service_role), asi que un
// no-admin no obtiene ni una ruta. Es el mismo criterio que el resto del panel
// (ver src/services/moderacionAdmin.ts).
//
// REINTENTO: la cola no se vacia acá. Una fila se cierra solo cuando Storage
// confirma el borrado; las que no, vuelven a salir en el proximo barrido. Por
// eso la RPC devuelve tambien los rezagados de retiros anteriores: la denuncia
// ya salio de la bandeja y nadie va a volver a apretar "Retirar" sobre ella.

const HEADERS_BASE = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

const BUCKET = 'pet-photos';
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

  // Cliente "anon + JWT del llamador". Las RPC se invocan con ESTE cliente y
  // nunca con service_role: adentro usan `es_admin()`, que mira `auth.uid()`.
  // Con service_role el gate quedaría en nada (auth.uid() es null y la funcion
  // abortaria, pero peor seria que alguna vez pasara al reves).
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

  // Se arma ANTES del try: si faltara la variable de entorno queremos enterarnos
  // ahora, no despues de haber sacado las rutas de la cola.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const cuerpo = await req.json().catch(() => ({}));
    const denunciaId = (cuerpo as { denunciaId?: unknown }).denunciaId;
    if (typeof denunciaId !== 'string' || !UUID.test(denunciaId)) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: HEADERS,
      });
    }

    // 1. Pedir las rutas. Solo lectura: si algo falla acá no quedo nada a medias.
    const { data: crudo, error: rpcError } = await callerClient.rpc('moderacion_fotos_a_borrar', {
      p_denuncia_id: denunciaId,
    });
    if (rpcError) {
      if ((rpcError.message ?? '').includes('no autorizado')) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
          status: 403,
          headers: HEADERS,
        });
      }
      throw new Error(`moderacion_fotos_a_borrar fallo: ${rpcError.message}`);
    }

    const pendientes = normalizarPendientes(crudo);

    // Segunda barrera del filtro de rutas (la primera la aplica la RPC al
    // encolar). Ver el comentario en _shared/barridoFotos.ts.
    const seguras = pendientes.filter((f) => rutaSegura(f.ruta));
    if (seguras.length < pendientes.length) {
      // Hoy esto no puede pasar: la cola solo se llena desde `moderar_retirar`
      // con el filtro puesto. Si alguna vez pasa, es un intento de que
      // borremos un archivo ajeno y sin este registro seria invisible.
      console.error(
        `moderar-borrar-foto: se descartaron ${pendientes.length - seguras.length} rutas con forma inesperada`,
      );
    }

    if (seguras.length === 0) {
      return new Response(JSON.stringify({ ok: true, borradas: 0, pendientes: 0 }), {
        status: 200,
        headers: HEADERS,
      });
    }

    const porRuta = agruparPorRuta(seguras);
    const rutas = [...porRuta.keys()];

    // 2. Borrar de Storage. Si la request entera se cae, no se marca nada: la
    //    cola queda igual y el proximo barrido lo reintenta.
    const { data: borradas, error: storageError } = await admin.storage.from(BUCKET).remove(rutas);
    if (storageError) throw new Error(`no se pudieron borrar las fotos: ${storageError.message}`);

    const { confirmadas, noConfirmadas, formaInesperada } = clasificarBorrado(rutas, borradas);
    if (formaInesperada) {
      console.error(
        'moderar-borrar-foto: Storage devolvio la cantidad justa de filas pero ningun `name` coincide; se asume borrado y hay que revisar la forma de la respuesta',
      );
    }
    if (noConfirmadas.length > 0) {
      // Borrado PARCIAL. No es un error de la request (eso ya se filtro arriba):
      // Storage simplemente no devolvio esas filas. Puede ser que ya no
      // estuvieran o que no las pudiera borrar; se reintentan.
      console.error(
        `moderar-borrar-foto: Storage no confirmo ${noConfirmadas.length} de ${rutas.length} fotos (denuncia ${denunciaId})`,
      );
    }

    // 3. Cerrar en la cola solo lo confirmado; lo demas suma un intento.
    const idsDe = (rs: string[]) => rs.flatMap((r) => porRuta.get(r) ?? []);
    const idsBorradas = idsDe(confirmadas);
    const idsFallidas = idsDe(noConfirmadas);
    const { data: marcadas, error: marcarError } = await callerClient.rpc('moderacion_fotos_marcar', {
      p_borradas: idsBorradas,
      p_fallidas: idsFallidas,
    });
    if (marcarError) {
      // El archivo ya no esta, pero la cola no se entero. El proximo barrido va
      // a pedirle a Storage una ruta que ya no existe (vuelve como "no
      // confirmada", suma intentos y a las 5 se abandona). No es silencioso y
      // no rompe nada, pero tiene que quedar en el log.
      console.error(`moderar-borrar-foto: no se pudo cerrar la cola: ${marcarError.message}`);
    } else {
      const cerradas = Array.isArray(marcadas)
        ? (marcadas as Array<{ estado?: unknown }>).filter((m) => m?.estado === 'borrada').length
        : 0;
      // Un update que no matchea NO devuelve error, solo afecta 0 filas: si se
      // marcaron menos de las que se creia, hay que verlo.
      if (cerradas !== idsBorradas.length) {
        console.error(
          `moderar-borrar-foto: se pidio cerrar ${idsBorradas.length} filas y se cerraron ${cerradas}`,
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, borradas: confirmadas.length, pendientes: noConfirmadas.length }),
      { status: 200, headers: HEADERS },
    );
  } catch (e) {
    // No se devuelve exito a medias: quien llama registra el fallo y la cola
    // queda intacta para el proximo barrido.
    console.error('error en moderar-borrar-foto', e);
    return new Response(JSON.stringify({ error: 'No se pudo borrar la foto del mensaje.' }), {
      status: 500,
      headers: HEADERS,
    });
  }
});
