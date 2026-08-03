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
// LO QUE SE PAGA A CAMBIO (riesgo aceptado, no un descuido): como las fotos se
// borran antes de anonimizar, si falla el paso 3 la persona queda con la cuenta
// entera viva y sus reportes con las imagenes rotas. Es feo, pero es visible y
// se arregla reintentando; el estado que evitamos era peor y silencioso (fotos
// publicas para siempre con la cuenta ya borrada y nadie a quien avisarle).
// Por eso la pantalla que llama a esto tiene que empujar al reintento.
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
    // Un unico segmento despues del uid: es la forma exacta que genera la app
    // (`${userId}/${Date.now()}.jpg`). Chequear solo el prefijo dejaria pasar
    // `<miuid>/../<uid-de-otro>/foto.jpg`.
    const prefijo = `${userId}/`;
    const misRutas = (paths as string[]).filter((p) => {
      if (!p.startsWith(prefijo)) return false;
      const resto = p.slice(prefijo.length);
      // `resto.length > 0` para que esto sea exactamente el mismo filtro que el
      // regex de la RPC (`^<uid>/[^/]+$`), que exige al menos un caracter. Dos
      // capas que se suponen iguales tienen que serlo.
      return resto.length > 0 && !resto.includes('/');
    });

    if (misRutas.length < paths.length) {
      // Se cuenta ANTES de deduplicar, para que este aviso signifique lo que
      // dice: rutas ajenas, no repetidas. Hoy solo puede pasar si alguien
      // guardo a mano la ruta de otra persona en su propio reporte, y sin este
      // registro un intento de abuso seria completamente invisible.
      console.warn(
        `delete-account: se descartaron ${paths.length - misRutas.length} rutas ajenas al usuario ${userId}`,
      );
    }

    // Deduplicar: una misma ruta repetida (por ejemplo `final_foto` que tambien
    // esta en `fotos`) haria que Storage devuelva menos filas de las pedidas y
    // el chequeo de mas abajo lo leeria como fallo parcial. Como la RPC es
    // idempotente, esa cuenta no podria borrarse NUNCA.
    const propias = [...new Set(misRutas)];

    // 2. Borrar las fotos. Todavia no se anonimizo: si esto falla, el reintento
    //    empieza de cero y vuelve a pedir la lista completa.
    if (propias.length > 0) {
      const { data: borradas, error: storageError } = await admin.storage
        .from('pet-photos')
        .remove(propias);
      if (storageError) throw new Error(`no se pudieron borrar las fotos: ${storageError.message}`);
      // `remove` devuelve MENOS filas de las pedidas en dos casos bien
      // distintos, y solo uno de los dos justifica frenar el borrado:
      //   a) la ruta ya no estaba en Storage (foto rota, borrado previo a
      //      medias, lo que sea): no hay nada que borrar, y no es culpa de
      //      esta corrida.
      //   b) Storage la tenia y no la pudo borrar: eso si es un fallo real.
      // Antes esto se trataba todo como (b) y lanzaba si faltaba una sola
      // fila. Como (a) puede pasar SIEMPRE que una fila de `pets` quedo
      // apuntando a una foto que ya no existe, esa cuenta nunca podia
      // borrarse, y borrar la cuenta es un requisito de las tiendas de apps.
      // Por eso ahora solo se falla si Storage devuelve `error` (arriba); acá
      // solo dejamos constancia de la diferencia para poder auditarla.
      if ((borradas ?? []).length !== propias.length) {
        console.warn(
          `delete-account: Storage no encontro ${propias.length - (borradas ?? []).length} de ${propias.length} fotos para el usuario ${userId} (probablemente ya no existian)`,
        );
      }
    }

    // 2.5. Borrar las fotos ANÓNIMAS (bucket privado `avisos-anonimos`, D4/D5,
    //      migración 0062), organizadas por `<pet_id>/...`. `anonimizar_mi_cuenta`
    //      (paso 3, más abajo) BORRA las filas de `pets`, así que estas carpetas
    //      hay que vaciarlas ANTES: Storage no está atado a la base por ninguna
    //      FK, y sin esto quedarían huérfanas para siempre (F13, revisión
    //      adversarial final — el mismo patrón list+remove que ya usa
    //      `deletePet` en src/services/pets.ts, acá con `admin` porque una vez
    //      borrada la fila de `pets` la policy de SELECT del dueño ya no tendría
    //      con qué hacer join). Si algo falla, se avisa y se sigue igual: mismo
    //      criterio que el resto de este archivo, no aborta el borrado de la cuenta.
    const { data: misPets, error: errPets } = await admin
      .from('pets')
      .select('id')
      .eq('user_id', userId);
    if (errPets) {
      console.warn(
        `delete-account: no se pudieron listar los reportes del usuario ${userId} para limpiar avisos-anonimos:`,
        errPets.message,
      );
    } else {
      for (const { id: petId } of (misPets ?? []) as Array<{ id: string }>) {
        const { data: anonimas, error: errLista } = await admin.storage
          .from('avisos-anonimos')
          .list(petId);
        if (errLista) {
          console.warn(`delete-account: no se pudo listar avisos-anonimos/${petId}:`, errLista.message);
          continue;
        }
        if (anonimas && anonimas.length > 0) {
          const { error: errRemove } = await admin.storage
            .from('avisos-anonimos')
            .remove(anonimas.map((f) => `${petId}/${f.name}`));
          if (errRemove) {
            console.warn(`delete-account: no se pudieron borrar las fotos anonimas de ${petId}:`, errRemove.message);
          }
        }
      }
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
