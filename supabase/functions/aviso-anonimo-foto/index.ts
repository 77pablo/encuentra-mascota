import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cabecerasCors, ORIGENES_DEV } from '../_shared/cors.ts';

// La única puerta por la que un anónimo puede subir una foto (spec F4). Valida
// acá lo que Storage no puede: tamaño, tipo y a qué reporte va. El aviso y su
// tope (10/hora, 30/día, 0055) los aplica la RPC; si la RPC descarta el aviso
// en silencio (pet inexistente/oculto, bloqueo, dedupe o tope), la foto NO se
// sube — la foto corre la misma suerte que el aviso, sin exponer por qué se
// descartó. La señal de descarte viaja como un valor interno (ver `data ===
// false` más abajo), NUNCA en la respuesta HTTP: las TRES 200 (camino feliz,
// descarte enmascarado, subida fallida) contestan EXACTAMENTE `{ ok: true }`,
// sin ningún campo que varíe — si no, un atacante distingue "entró" de
// "descartado/tope/oculto" con solo mirar el body (revisión adversarial
// final, F2). Tampoco se usa una excepción para señalar el descarte: un
// `raise exception` haría rollback del insert en `seguimientos_anonimos` (el
// "avisame si aparece" del correo), que corre ANTES de los descartes por
// dedupe/tope justamente para sobrevivirlos.
const WINDOW_MS = 60_000;
const MAX = 5;
const hits = new Map<string, number[]>();
const MAX_BYTES = 2 * 1024 * 1024;
// Base64 infla ~33% (4 chars por cada 3 bytes); se deja margen extra (~1.5×
// sobre MAX_BYTES) para el resto de las claves del JSON.
const MAX_BASE64_LEN = Math.ceil((MAX_BYTES * 4) / 3) + 1024;
const MAX_CONTENT_LENGTH = MAX_BASE64_LEN + 2048; // + margen para pet_id/nota/correo/comillas del JSON
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
    // F16: el tope de tamaño se chequea ANTES de parsear nada. Base64 infla el
    // tamaño real ~33%, así que 2 MB de foto pesan hasta ~2.7 MB en el body;
    // MAX_CONTENT_LENGTH deja margen para el resto del JSON (pet_id, nota,
    // correo) sin abrir la puerta a un body gigante que igual iba a ser
    // rechazado después de gastar CPU en `req.json()`.
    const contentLength = Number(req.headers.get('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
      return new Response(JSON.stringify({ error: 'La foto pesa más de 2 MB' }), { status: 413, headers: HEADERS });
    }

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
    // Mismo tope, pero sobre el string base64 ya en memoria: cubre el caso sin
    // `Content-Length` (proxies/streaming) ANTES de gastar CPU decodificando
    // con `atob` un string que de todos modos íbamos a rechazar.
    if (body.foto_base64.length > MAX_BASE64_LEN) {
      return new Response(JSON.stringify({ error: 'La foto pesa más de 2 MB' }), { status: 413, headers: HEADERS });
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
      // EXACTAMENTE lo mismo que el camino feliz (F2): ni `foto` ni ningún
      // otro campo que varíe, para no convertirnos en un oráculo de bloqueos
      // ni de topes.
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
    }

    // Si la subida falla, el aviso ya salió igual: el dueño ve la nota sin la
    // foto. La respuesta es la MISMA de los otros dos caminos 200 (F2): la
    // única señal es un console.warn en los logs del servidor, no en el body.
    const { error: errSubida } = await supabase.storage
      .from('avisos-anonimos')
      .upload(path, bytes, { contentType, upsert: false });
    if (errSubida) console.warn('no se pudo subir la foto del aviso anonimo', errSubida.message);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: HEADERS });
  } catch (e) {
    // Nunca loguear el body ni datos del request acá: podría contener la
    // foto en base64 o el correo de seguimiento.
    console.error('error en aviso-anonimo-foto', e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500, headers: HEADERS });
  }
});
