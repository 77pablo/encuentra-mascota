import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// La única puerta por la que un anónimo puede subir una foto (spec F4). Valida
// acá lo que Storage no puede: tamaño, tipo y a qué reporte va. El aviso y su
// tope (10/hora, 30/día, 0055) los aplica la RPC; si la RPC descarta el aviso
// en silencio (pet inexistente/oculto, bloqueo, dedupe o tope), devuelve
// `false` cuando la llamada vino con foto y acá NO subimos nada — la foto
// corre la misma suerte que el aviso, sin exponer por qué se descartó. La
// señal viaja en el valor de retorno, no como excepción: un `raise exception`
// haría rollback del insert en `seguimientos_anonimos` (el "avisame si
// aparece" del correo), que corre ANTES de los descartes por dedupe/tope
// justamente para sobrevivirlos.
const WINDOW_MS = 60_000;
const MAX = 5;
const hits = new Map<string, number[]>();
const MAX_BYTES = 2 * 1024 * 1024;
const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS_BASE = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

function origenesPermitidos(): string[] {
  const web = Deno.env.get('EXPO_PUBLIC_WEB_URL');
  return web ? [web.replace(/\/$/, ''), ...ORIGENES_DEV] : ORIGENES_DEV;
}

function rateLimited(ip: string): boolean {
  const ahora = Date.now();
  const previos = (hits.get(ip) ?? []).filter((t) => ahora - t < WINDOW_MS);
  previos.push(ahora);
  hits.set(ip, previos);
  return previos.length > MAX;
}

Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req.headers.get('Origin'), origenesPermitidos());
  const HEADERS = { ...HEADERS_BASE, ...cors };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405, headers: { ...HEADERS, Allow: 'POST, OPTIONS' },
    });
  }
  if (rateLimited(req.headers.get('x-forwarded-for') ?? 'desconocida')) {
    return new Response(JSON.stringify({ error: 'Demasiados intentos, esperá un minuto' }), { status: 429, headers: HEADERS });
  }

  try {
    let body: { pet_id?: string; nota?: string; correo?: string; foto_base64?: string; content_type?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Cuerpo inválido' }), { status: 400, headers: HEADERS });
    }

    const petId = body.pet_id ?? '';
    const contentType = body.content_type ?? '';
    if (!UUID_RE.test(petId) || !(contentType in TIPOS) || typeof body.foto_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400, headers: HEADERS });
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.foto_base64), (c) => c.charCodeAt(0));
    } catch {
      return new Response(JSON.stringify({ error: 'La foto no se pudo leer' }), { status: 400, headers: HEADERS });
    }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'La foto pesa más de 2 MB' }), { status: 413, headers: HEADERS });
    }

    // service_role SOLO existe acá (env de la función), nunca en la app.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const path = `${petId}/${crypto.randomUUID()}.${TIPOS[contentType]}`;

    // Primero el aviso (con sus topes de la 0055 adentro), después la foto: si
    // la RPC corta, preferimos un aviso sin foto antes que una foto sin aviso.
    const { data, error: errRpc } = await supabase.rpc('avistar_sin_cuenta', {
      p_pet_id: petId,
      p_nota: (body.nota ?? '').trim().slice(0, 500) || null,
      p_lat: null,
      p_lng: null,
      p_correo: (body.correo ?? '').trim().toLowerCase() || null,
      p_foto_path: path,
    });
    if (errRpc) {
      return new Response(JSON.stringify({ error: 'No se pudo registrar el aviso' }), { status: 502, headers: HEADERS });
    }
    if (data === false) {
      // La RPC descartó el aviso en silencio (pet inexistente/oculto,
      // bloqueo, dedupe o tope de 10/hora-30/día) y nos lo señala con
      // `false` para que la foto NO se suba — pero hacia afuera contestamos
      // EXACTAMENTE lo mismo que el camino feliz, para no convertirnos en un
      // oráculo de bloqueos ni de topes.
      return new Response(JSON.stringify({ ok: true, foto: false }), { status: 200, headers: HEADERS });
    }

    const { error: errSubida } = await supabase.storage
      .from('avisos-anonimos')
      .upload(path, bytes, { contentType, upsert: false });
    // Si la subida falla, el aviso ya salió: el dueño ve la nota sin la foto.
    return new Response(JSON.stringify({ ok: true, foto: errSubida ? false : true }), { status: 200, headers: HEADERS });
  } catch (e) {
    // Nunca loguear el body ni datos del request acá: podría contener la
    // foto en base64 o el correo de seguimiento.
    console.error('error en aviso-anonimo-foto', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: HEADERS });
  }
});
