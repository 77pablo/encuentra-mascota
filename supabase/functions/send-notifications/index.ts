import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  componerAviso,
  Contexto,
  EventoAviso,
  Prefs,
  resolverDestinatarios,
  ZonaAlerta,
} from './notifyTargets.ts';
import { enviarWebPush } from '../_shared/webpush.ts';

// DESPACHADOR DE AVISOS
//
// Lee la cola `notification_events` (que solo escriben los triggers de la
// migración 0011), resuelve a quién le toca cada aviso con la MISMA lógica que
// usa la app, y despacha por correo (Resend) y push (Expo).
//
// Se ejecuta con la service role key: la tabla `notification_events` no tiene
// ninguna política de RLS, así que es invisible para la app y solo esta función
// la puede tocar.
//
// Si la función no está desplegada, los triggers siguen encolando y no se envía
// nada. Eso es lo esperado, no un bug.

const LOTE = 50; // cuántos eventos procesamos por corrida
const MAX_INTENTOS = 3; // a los 3 intentos abandonamos el evento para no trabar la cola

const HEADERS = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

interface EventoRow {
  id: string;
  tipo:
    | 'reporte_nuevo'
    | 'avistamiento'
    | 'pista'
    | 'coincidencia'
    | 'escaneo_collar'
    | 'busqueda_guardada';
  // pet_id es nullable desde la 0027: un 'escaneo_collar' no tiene reporte.
  pet_id: string | null;
  actor_id: string | null;
  // Destinatario directo ('escaneo_collar' y 'busqueda_guardada'): a quién avisarle.
  target_user_id: string | null;
  datos: Record<string, unknown>;
  intentos: number;
}

type Supa = ReturnType<typeof createClient>;

// Escapa el texto antes de meterlo en el HTML del correo.
// NO ES OPCIONAL: el cuerpo de un aviso de tipo 'pista' incluye un extracto
// escrito por cualquier vecino, así que sin esto una pista maliciosa podría
// inyectar HTML en el correo que le llega al dueño del reporte.
function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Cuerpo HTML del aviso, con el texto ya escapado.
function armarHtml(titulo: string, cuerpo: string, url: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; color: #23231D; line-height: 1.5;">
      <h2 style="color: #17654B; margin-bottom: 8px;">${escaparHtml(titulo)}</h2>
      <p style="margin-top: 0;">${escaparHtml(cuerpo)}</p>
      <p><a href="${encodeURI(url)}" style="background: #17654B; color: #fff; padding: 10px 18px;
        border-radius: 999px; text-decoration: none; display: inline-block;">Ver el reporte</a></p>
      <p style="color: #7E7B6F; font-size: 12px;">Encuentra tu Mascota · Podés cambiar tus avisos
        desde Perfil → Avisos.</p>
    </div>`;
}

// Manda un correo. Soportamos DOS proveedores y se elige por configuración:
//
//   · BREVO  (preferido hoy): verifica UNA dirección suelta, sin dominio propio,
//     y regala 300 correos por día. Es lo que nos permite escribirle a cualquier
//     vecino sin comprar un dominio.
//   · RESEND (el original): necesita un dominio verificado; en modo prueba solo
//     entrega al correo del dueño de la cuenta. Se deja como alternativa para
//     cuando haya dominio propio, que es la opción más confiable a la larga.
//
// Si no hay ninguno configurado, el canal se salta en silencio y devuelve false:
// el push igual se intenta. Un error del proveedor SÍ se propaga, para que el
// evento quede marcado y se reintente.
async function enviarCorreo(para: string, titulo: string, cuerpo: string, url: string): Promise<boolean> {
  const html = armarHtml(titulo, cuerpo, url);

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const brevoFrom = Deno.env.get('BREVO_FROM');
  if (brevoKey && brevoFrom) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: brevoFrom, name: Deno.env.get('BREVO_FROM_NAME') ?? 'Encuentra tu Mascota' },
        to: [{ email: para }],
        subject: titulo,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      // El detalle importa: Brevo devuelve 401 si la key está mal y 400 si el
      // remitente no está verificado, y sin el cuerpo son indistinguibles.
      const detalle = await res.text().catch(() => '');
      throw new Error(`Brevo respondió ${res.status}: ${detalle.slice(0, 200)}`);
    }
    return true;
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM');
  if (resendKey && resendFrom) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: resendFrom, to: [para], subject: titulo, html }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`Resend respondió ${res.status}: ${detalle.slice(0, 200)}`);
    }
    return true;
  }

  return false;
}

// Manda el push por la API de Expo a todos los tokens del destinatario Y,
// además, Web Push (VAPID) a sus suscripciones de navegador. Un solo canal
// "push" para quien llama a `procesar()`: la persona que recibe el aviso no
// tiene por qué saber (ni le importa) si le llegó por Expo o por el
// navegador, y las preferencias (`canalPush`) son una sola.
async function enviarPush(
  supabase: Supa,
  userId: string,
  titulo: string,
  cuerpo: string,
  ruta: string,
): Promise<boolean> {
  let enviado = false;

  // --- Expo (app nativa instalada) -----------------------------------------
  // El fetch (y su chequeo de `res.ok`) va en su propio try/catch: un fallo
  // de la API de Expo (rate limit, 5xx, red caída) NO debe impedir que se
  // intente el bloque de Web Push de abajo, ni cortar el loop de
  // destinatarios en `procesar()`, si el destinatario también tiene una
  // suscripción web sana. Guardamos el error para, al final de la función,
  // decidir si de verdad hay que propagarlo (ver el `throw` más abajo).
  let expoError: unknown = null;
  const { data: tokens } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  const mensajes = ((tokens ?? []) as Array<{ token: string }>).map((t) => ({
    to: t.token,
    title: titulo,
    body: cuerpo,
    data: { ruta },
  }));
  if (mensajes.length > 0) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mensajes),
      });
      if (!res.ok) throw new Error(`Expo push respondió ${res.status}`);
      enviado = true;
    } catch (e) {
      expoError = e;
      console.error(`fallo el push Expo para ${userId}`, e);
    }
  }

  // --- Web Push (VAPID), best-effort ---------------------------------------
  // A propósito NUNCA lanza ni tumba el envío por Expo de arriba:
  // `enviarWebPush` ya atrapa sus propios errores (ver _shared/webpush.ts), y
  // acá directo se ignora cualquier suscripción que falle — es un canal
  // adicional, no reemplaza al de Expo. Sin las tres variables de entorno
  // (proyecto sin Web Push configurado todavía) se salta en silencio, igual
  // que el correo cuando no hay proveedor configurado (ver `enviarCorreo`).
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
    const { data: webSubs } = await supabase
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    for (const s of (webSubs ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>) {
      const r = await enviarWebPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        { title: titulo, body: cuerpo, ruta },
        { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject },
      );
      if (r.gone) {
        // El navegador ya no tiene esa suscripción (desinstaló, limpió datos
        // del sitio, etc.): se borra para no reintentar contra un endpoint
        // muerto en cada aviso futuro.
        await supabase.from('web_push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else if (r.ok) {
        enviado = true;
      }
    }
  }

  // Si ningún canal entregó nada Y Expo falló de verdad (no fue simplemente
  // "no tenía token"), ahí sí propaga: es un fallo real y `procesar()` lo
  // necesita para reintentar el evento, igual que antes de este arreglo. La
  // diferencia es que ahora solo pasa cuando Web Push tampoco salvó el envío.
  if (!enviado && expoError) {
    throw expoError instanceof Error ? expoError : new Error(String(expoError));
  }

  return enviado;
}

// userIds con los que el ACTOR del evento tiene un bloqueo, en cualquiera de las
// dos direcciones. Ninguno de ellos debe recibir el aviso (ver el comentario de
// `bloqueadosConActor` en notifyTargets.ts).
//
// Esta consulta SOLO se puede hacer acá: la RLS de la 0022 es asimétrica a
// propósito (nadie puede leer quién lo bloqueó), y esta función corre con la
// service_role key, que se saltea RLS. La app nunca podría resolverlo.
//
// Degrada a lista vacía —o sea, "no filtra nada"— si no hay actor, si la
// consulta falla o si la tabla `bloqueos` todavía no existe. Es la elección
// deliberada: que la cola de avisos se trabe entera es peor que un aviso de más,
// y esto NO es el control de acceso (ese vive en la RLS de `messages`).
async function bloqueadosConElActor(supabase: Supa, actorId: string | null): Promise<string[]> {
  if (!actorId) return [];
  try {
    const { data, error } = await supabase
      .from('bloqueos')
      .select('bloqueador, bloqueado')
      .or(`bloqueador.eq.${actorId},bloqueado.eq.${actorId}`);
    if (error || !data) {
      if (error) console.warn('no se pudieron leer los bloqueos del actor', error.message);
      return [];
    }
    // De cada fila queda "el otro": el actor está en uno de los dos extremos.
    return (data as Array<{ bloqueador: string; bloqueado: string }>).map((b) =>
      b.bloqueador === actorId ? b.bloqueado : b.bloqueador,
    );
  } catch (e) {
    console.warn('no se pudieron leer los bloqueos del actor', e);
    return [];
  }
}

// Arma el contexto que necesita `resolverDestinatarios`: dueño y nombre del
// reporte, zonas de alerta activas (solo hacen falta para 'reporte_nuevo'),
// las preferencias de todos los candidatos y con quién tiene bloqueo el actor.
async function armarContexto(supabase: Supa, ev: EventoRow): Promise<Contexto | null> {
  // Se resuelve UNA vez, arriba de todo: los tres caminos de abajo (collar,
  // búsqueda guardada, y el genérico por reporte) tienen que incluirlo, y
  // calcularlo acá es lo que evita que uno se olvide.
  const bloqueadosConActor = await bloqueadosConElActor(supabase, ev.actor_id);

  // 'escaneo_collar' NO tiene reporte (pet_id = null): el destinatario es directo
  // (ev.target_user_id, el dueño de la ficha) y el nombre viene en datos. Este
  // branch DEBE ir antes del `select` a pets, porque con pet_id=null esa consulta
  // devolvería null y el aviso se perdería.
  if (ev.tipo === 'escaneo_collar') {
    const target = ev.target_user_id;
    if (!target) return null; // sin destinatario no hay a quién avisarle
    const nombrePet = typeof ev.datos.nombre_mascota === 'string' ? ev.datos.nombre_mascota : null;
    const prefs: Record<string, Prefs> = {};
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', target)
      .maybeSingle();
    if (data) {
      const row = data as Record<string, boolean | string>;
      prefs[target] = {
        userId: target,
        zona: row.zona as boolean,
        avistamientos: row.avistamientos as boolean,
        pistas: row.pistas as boolean,
        coincidencias: row.coincidencias as boolean,
        canalEmail: row.canal_email as boolean,
        canalPush: row.canal_push as boolean,
      };
    }
    return { duenoPetId: target, nombrePet, zonas: [], prefs, seguidoresComuna: [], bloqueadosConActor };
  }

  // 'busqueda_guardada' SÍ tiene pet_id (el reporte recién publicado que calzó),
  // pero el destinatario es directo (ev.target_user_id, quien guardó la
  // búsqueda), NO el dueño de ese reporte. Este branch debe ir antes del
  // `select` genérico a `pets` de abajo: si no, `duenoPetId` quedaría con el
  // autor del reporte y las prefs se pedirían para la persona equivocada (se
  // ignoraría su preferencia real de canales).
  if (ev.tipo === 'busqueda_guardada') {
    const target = ev.target_user_id;
    if (!target) return null; // sin destinatario no hay a quién avisarle
    const prefs: Record<string, Prefs> = {};
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', target)
      .maybeSingle();
    if (data) {
      const row = data as Record<string, boolean | string>;
      prefs[target] = {
        userId: target,
        zona: row.zona as boolean,
        avistamientos: row.avistamientos as boolean,
        pistas: row.pistas as boolean,
        coincidencias: row.coincidencias as boolean,
        canalEmail: row.canal_email as boolean,
        canalPush: row.canal_push as boolean,
      };
    }
    return { duenoPetId: target, nombrePet: null, zonas: [], prefs, seguidoresComuna: [], bloqueadosConActor };
  }

  const { data: pet } = await supabase
    .from('pets')
    .select('user_id, nombre')
    .eq('id', ev.pet_id)
    .maybeSingle();
  if (!pet) return null; // el reporte se borró: no hay a quién avisarle

  const duenoPetId = (pet as { user_id: string }).user_id;
  const nombrePet = (pet as { nombre: string | null }).nombre ?? null;

  let zonas: ZonaAlerta[] = [];
  let seguidoresComuna: string[] = [];
  if (ev.tipo === 'reporte_nuevo') {
    const { data } = await supabase
      .from('alert_zones')
      .select('user_id, lat, lng, radio_km')
      .eq('activo', true)
      .not('lat', 'is', null)
      .not('lng', 'is', null);
    zonas = ((data ?? []) as Array<{ user_id: string; lat: number; lng: number; radio_km: number }>).map(
      (z) => ({ userId: z.user_id, lat: z.lat, lng: z.lng, radioKm: z.radio_km }),
    );

    // Camino por comuna (Tanda 3 · C): quien SIGUE la comuna del reporte recibe el
    // aviso además del camino por zona GPS. El evento trae la comuna en datos.comuna
    // (migración 0020). Es un opt-in explícito, así que después NO se filtra por `zona`.
    const comuna = typeof ev.datos.comuna === 'string' ? (ev.datos.comuna as string) : null;
    if (comuna) {
      const { data: seg } = await supabase
        .from('notification_prefs')
        .select('user_id')
        .contains('comunas_seguidas', [comuna]);
      seguidoresComuna = ((seg ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    }
  }

  // Solo pedimos las prefs de quienes podrían recibir el aviso: la UNIÓN del camino
  // por zona y del camino por comuna seguida (para que el filtro de canales aplique a
  // ambos). El `Set` deduplica a quien está en los dos.
  const candidatos =
    ev.tipo === 'reporte_nuevo'
      ? [...zonas.map((z) => z.userId), ...seguidoresComuna]
      : [duenoPetId];
  const prefs: Record<string, Prefs> = {};
  if (candidatos.length > 0) {
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .in('user_id', [...new Set(candidatos)]);
    for (const row of (data ?? []) as Array<Record<string, boolean | string>>) {
      const userId = row.user_id as string;
      prefs[userId] = {
        userId,
        zona: row.zona as boolean,
        avistamientos: row.avistamientos as boolean,
        pistas: row.pistas as boolean,
        coincidencias: row.coincidencias as boolean,
        canalEmail: row.canal_email as boolean,
        canalPush: row.canal_push as boolean,
      };
    }
  }

  return { duenoPetId, nombrePet, zonas, prefs, seguidoresComuna, bloqueadosConActor };
}

async function procesar(supabase: Supa, ev: EventoRow): Promise<number> {
  const ctx = await armarContexto(supabase, ev);
  if (!ctx) return 0;

  const evento: EventoAviso = {
    id: ev.id,
    tipo: ev.tipo,
    petId: ev.pet_id ?? '',
    actorId: ev.actor_id,
    targetUserId: ev.target_user_id,
    datos: (ev.datos ?? {}) as EventoAviso['datos'],
  };

  const destinatarios = resolverDestinatarios(evento, ctx);
  if (destinatarios.length === 0) return 0;

  const { titulo, cuerpo, ruta } = componerAviso(evento, ctx);
  const base = Deno.env.get('EXPO_PUBLIC_WEB_URL') ?? '';
  const url = `${base}${ruta}`;

  let enviados = 0;
  for (const d of destinatarios) {
    if (d.canales.includes('email')) {
      // El correo vive en auth.users, no en profiles.
      const { data: userData } = await supabase.auth.admin.getUserById(d.userId);
      const email = userData?.user?.email;
      if (email && (await enviarCorreo(email, titulo, cuerpo, url))) enviados++;
    }
    if (d.canales.includes('push')) {
      if (await enviarPush(supabase, d.userId, titulo, cuerpo, ruta)) enviados++;
    }
  }
  return enviados;
}

Deno.serve(async (req: Request) => {
  // Esta función NO se llama desde el navegador: la dispara pg_cron con POST
  // (ver docs/agendar-avisos.sql). Por eso no lleva cabeceras CORS: no hay
  // ningún origen web que deba poder invocarla.
  //
  // El chequeo de método NO es cosmético. El gateway de Supabase deja pasar el
  // preflight OPTIONS SIN verificar el JWT (para que las funciones puedan
  // contestarlo), y esta función ignoraba el método: un `curl -X OPTIONS` sin
  // ninguna credencial devolvía 200 y despachaba la cola entera. Comprobado
  // contra el proyecto real antes de este arreglo. Con esto, un OPTIONS se
  // contesta y se corta antes de tocar la base.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...HEADERS, Allow: 'POST' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, tipo, pet_id, actor_id, target_user_id, datos, intentos')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true })
      .limit(LOTE);

    if (error) {
      // Sin la migración 0011 la tabla no existe: no es un error que valga la
      // pena reintentar, simplemente no hay nada que despachar todavía.
      console.warn('no se pudo leer la cola de avisos', error.message);
      return new Response(JSON.stringify({ ok: true, procesados: 0 }), { status: 200, headers: HEADERS });
    }

    const eventos = (data ?? []) as unknown as EventoRow[];
    let ok = 0;
    let fallidos = 0;

    for (const ev of eventos) {
      // Un evento que ya falló demasiadas veces se abandona: no queremos que un
      // solo evento roto trabe la cola entera.
      if (ev.intentos >= MAX_INTENTOS) {
        await supabase
          .from('notification_events')
          .update({ estado: 'error', procesado_en: new Date().toISOString() })
          .eq('id', ev.id);
        continue;
      }

      try {
        await procesar(supabase, ev);
        await supabase
          .from('notification_events')
          .update({ estado: 'enviado', procesado_en: new Date().toISOString() })
          .eq('id', ev.id);
        ok++;
      } catch (e) {
        console.error(`fallo el evento ${ev.id}`, e);
        const intentos = ev.intentos + 1;
        await supabase
          .from('notification_events')
          .update({
            // Si todavía le quedan intentos lo dejamos pendiente para la
            // próxima corrida; si no, queda marcado como error.
            estado: intentos >= MAX_INTENTOS ? 'error' : 'pendiente',
            intentos,
            // Guardamos el motivo en la fila: sin esto, un aviso que no sale
            // falla en absoluto silencio y hay que adivinar por qué. Los logs
            // de la Edge Function no siempre están a mano.
            error_detalle: String(e instanceof Error ? e.message : e).slice(0, 500),
          })
          .eq('id', ev.id);
        fallidos++;
      }
    }

    return new Response(JSON.stringify({ ok: true, procesados: ok, fallidos }), {
      status: 200,
      headers: HEADERS,
    });
  } catch (e) {
    console.error('error en send-notifications', e);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: HEADERS });
  }
});
