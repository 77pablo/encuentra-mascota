import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  componerAviso,
  Contexto,
  EventoAviso,
  Prefs,
  resolverDestinatarios,
  ZonaAlerta,
} from './notifyTargets.ts';

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
  tipo: 'reporte_nuevo' | 'avistamiento' | 'pista';
  pet_id: string;
  actor_id: string | null;
  datos: Record<string, unknown>;
  intentos: number;
}

type Supa = ReturnType<typeof createClient>;

// Manda un correo por la API de Resend. Si falta la configuración, el canal se
// salta en silencio y devuelve false: el otro canal igual se intenta.
async function enviarCorreo(para: string, titulo: string, cuerpo: string, url: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM');
  if (!apiKey || !from) return false;

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #23231D; line-height: 1.5;">
      <h2 style="color: #17654B; margin-bottom: 8px;">${titulo}</h2>
      <p style="margin-top: 0;">${cuerpo}</p>
      <p><a href="${url}" style="background: #17654B; color: #fff; padding: 10px 18px;
        border-radius: 999px; text-decoration: none; display: inline-block;">Ver el reporte</a></p>
      <p style="color: #7E7B6F; font-size: 12px;">Encuentra tu Mascota · Podés cambiar tus avisos
        desde Perfil → Avisos.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [para], subject: titulo, html }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
  return true;
}

// Manda el push por la API de Expo a todos los tokens del destinatario.
async function enviarPush(
  supabase: Supa,
  userId: string,
  titulo: string,
  cuerpo: string,
  ruta: string,
): Promise<boolean> {
  const { data: tokens } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  const mensajes = ((tokens ?? []) as Array<{ token: string }>).map((t) => ({
    to: t.token,
    title: titulo,
    body: cuerpo,
    data: { ruta },
  }));
  if (mensajes.length === 0) return false;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mensajes),
  });
  if (!res.ok) throw new Error(`Expo push respondió ${res.status}`);
  return true;
}

// Arma el contexto que necesita `resolverDestinatarios`: dueño y nombre del
// reporte, zonas de alerta activas (solo hacen falta para 'reporte_nuevo') y
// las preferencias de todos los candidatos.
async function armarContexto(supabase: Supa, ev: EventoRow): Promise<Contexto | null> {
  const { data: pet } = await supabase
    .from('pets')
    .select('user_id, nombre')
    .eq('id', ev.pet_id)
    .maybeSingle();
  if (!pet) return null; // el reporte se borró: no hay a quién avisarle

  const duenoPetId = (pet as { user_id: string }).user_id;
  const nombrePet = (pet as { nombre: string | null }).nombre ?? null;

  let zonas: ZonaAlerta[] = [];
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
  }

  // Solo pedimos las prefs de quienes podrían recibir el aviso.
  const candidatos = ev.tipo === 'reporte_nuevo' ? zonas.map((z) => z.userId) : [duenoPetId];
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

  return { duenoPetId, nombrePet, zonas, prefs };
}

async function procesar(supabase: Supa, ev: EventoRow): Promise<number> {
  const ctx = await armarContexto(supabase, ev);
  if (!ctx) return 0;

  const evento: EventoAviso = {
    id: ev.id,
    tipo: ev.tipo,
    petId: ev.pet_id,
    actorId: ev.actor_id,
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

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, tipo, pet_id, actor_id, datos, intentos')
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
