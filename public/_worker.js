// Worker de Cloudflare Pages (Agente A — tanda "difusión + PWA").
//
// JS plano autónomo: SIN imports de node ni de la app (Cloudflare lo ejecuta
// tal cual, sin build step). Hace de _headers + _redirects a la vez (en
// "advanced mode" ambos dejan de aplicar solos) y agrega vista previa Open
// Graph al compartir links de reportes/adopciones.
//
// Orden de decisiones en fetch():
//   1) assets estáticos (extensión de archivo, prefijos conocidos, o
//      /borrar-cuenta explícito) → tal cual, vía env.ASSETS.fetch.
//   2) todo lo demás sin extensión → index.html (fallback SPA).
//   3) si la ruta es /mascota/:uuid o /adopcion/:uuid → se intenta enriquecer
//      ese index con meta tags OG leyendo datos públicos de Supabase.
//   4) siempre se inyectan las tags PWA (interfaz fija con el Agente B).
//   5) toda respuesta HTML lleva las 5 cabeceras de seguridad de _headers.
//
// Regla dura: escapar TODO dato de usuario antes de meterlo en HTML — este
// worker es el primer HTML generado en servidor de la app.

// Anon key y URL de Supabase: son públicas por diseño (ya viajan en el bundle
// JS de la app). Copiadas literales desde .env porque el worker no tiene
// process.env.
const SUPABASE_URL = 'https://ywlrcfaybnikaurxsgtj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K1UXXganPME34mfGqvt9vA_DOrcbwr6';

// ---------------------------------------------------------------------------
// Funciones puras (testeadas en __tests__/worker/ogWorker.test.ts)
// ---------------------------------------------------------------------------

// Nota Cloudflare (verificada con `wrangler pages dev`): el runtime de
// Workers valida CADA named export del módulo y exige que sea una función o
// un ExportedHandler — un `export const TAGS_PWA = '...'` (string) tira
// "Incorrect type for map entry... not of type 'function or ExportedHandler'"
// y el worker ni arranca. Por eso acá NO hay named exports: las funciones
// puras y TAGS_PWA se declaran normales y se cuelgan como propiedades del
// `export default`, que es el único export del módulo (jest y Cloudflare
// acceden a ellas igual, vía `worker.escaparHtml`, etc.).

// Escapa los cinco caracteres peligrosos de HTML. Cualquier dato de usuario
// (nombre, descripción) pasa por acá antes de entrar a un atributo o al head.
function escaparHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Recorta un texto a ~150 caracteres agregando "…" si se pasó. No corta a
// mitad de nada especial: es un recorte simple, suficiente para og:description.
function recortarDescripcion(texto, max) {
  const limite = max || 150;
  const limpio = (texto || '').trim();
  if (limpio.length <= limite) return limpio;
  return limpio.slice(0, limite).trimEnd() + '…';
}

function capitalizar(palabra) {
  if (!palabra) return '';
  return palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1);
}

// Título OG de un reporte (perdida/encontrada/reunida). `row` es la fila de
// `pets` devuelta por PostgREST (select del spec F1).
function tituloDeReporte(row) {
  const nombre = row.nombre || 'esta mascota';
  const especie = capitalizar(row.especie) || 'Mascota';
  if (row.reunida_en) {
    return `¡Volvió a casa! ${especie} «${nombre}»`;
  }
  const esPerdida = row.estado === 'perdida';
  const emoji = esPerdida ? '🔴' : '🟢';
  const estado = esPerdida ? 'PERDIDA' : 'ENCONTRADA';
  const comuna = row.comuna ? String(row.comuna).trim() : '';
  const comunaParte = comuna ? ` en ${comuna}` : '';
  return `${emoji} ${estado}${comunaParte} — ${especie} «${nombre}»`;
}

// Título OG de una publicación de adopción. `row` es la fila de `adoptions`
// devuelta por PostgREST (select del spec F1).
function tituloDeAdopcion(row) {
  const nombre = row.nombre || 'Esta mascota';
  if (row.adoptada_en) {
    return `¡Ya encontró familia! ${nombre}`;
  }
  const comuna = row.comuna ? String(row.comuna).trim() : '';
  const comunaParte = comuna ? ` en ${comuna}` : '';
  return `${nombre} busca hogar${comunaParte}`;
}

// Arma el bloque de meta tags Open Graph + Twitter Card, escapando todo lo
// que puede venir de un usuario (título, descripción, imagen, url).
function armarMetaTags(datos) {
  const titulo = escaparHtml(datos.titulo || '');
  const descripcion = escaparHtml(recortarDescripcion(datos.descripcion || ''));
  const imagen = datos.imagen ? escaparHtml(datos.imagen) : '';
  const url = escaparHtml(datos.url || '');
  const imagenTags = imagen
    ? `<meta property="og:image" content="${imagen}">\n<meta name="twitter:image" content="${imagen}">\n`
    : '';
  // Igual que con la imagen: si no hay descripción, se OMITEN las tags en vez
  // de emitirlas con content="" (un content vacío es peor que ausente para
  // quien arma la preview del link).
  const descripcionTags = descripcion
    ? `<meta property="og:description" content="${descripcion}">\n<meta name="twitter:description" content="${descripcion}">\n`
    : '';
  return `
<meta property="og:title" content="${titulo}">
${descripcionTags}${imagenTags}<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Encuentra tu Mascota">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
`;
}

// Inserta `extra` justo antes de `</head>`. Si no hay `</head>` (o no hay
// extra), devuelve el html intacto — nunca revienta el fallback SPA.
function inyectarEnHead(html, extra) {
  if (!extra) return html;
  const idx = html.indexOf('</head>');
  if (idx === -1) return html;
  return html.slice(0, idx) + extra + html.slice(idx);
}

// Tags PWA que se inyectan en TODO html (interfaz fija con el Agente B: estos
// nombres de archivo los crea/mantiene B, acá solo se referencian).
const TAGS_PWA = `
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#17654B">
<link rel="apple-touch-icon" href="/icons/icono-180.png">
<script src="/registrar-sw.js" defer></script>
`;

// Las 5 cabeceras de seguridad, copiadas VERBATIM de public/_headers (en
// "advanced mode" ese archivo deja de aplicar solo; el worker asume su rol).
const CABECERAS_HTML = {
  'content-type': 'text/html; charset=utf-8',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(), payment=()',
  // Este HTML lleva OG dinámico por :uuid (título/estado/foto de una mascota
  // puntual): que ningún intermediario (proxy, CDN de un tercero) lo retenga
  // y sirva una preview vieja (p. ej. "PERDIDA" después de reunida_en).
  'Cache-Control': 'no-cache',
};

// ---------------------------------------------------------------------------
// Acceso a datos públicos (PostgREST) — falla abierto ante cualquier problema.
// ---------------------------------------------------------------------------

const CAMPOS_MASCOTA = 'nombre,especie,estado,comuna,fotos,descripcion,reunida_en';
const CAMPOS_ADOPCION = 'nombre,especie,edad,tamano,comuna,fotos,descripcion,adoptada_en';

// Pide a Supabase los datos públicos de un reporte o una adopción. RLS decide
// qué se ve: 0 filas (borrado/oculto) → null, tratado igual que un error.
// Timeout de ~2s: un hipo de la base jamás debe tirar el sitio.
async function datosPublicos(tipo, id) {
  const tabla = tipo === 'mascota' ? 'pets' : 'adoptions';
  const campos = tipo === 'mascota' ? CAMPOS_MASCOTA : CAMPOS_ADOPCION;
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/${tabla}?id=eq.${id}&select=${campos}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(2000),
    }
  );
  if (!resp.ok) return null;
  const filas = await resp.json();
  if (!Array.isArray(filas) || filas.length === 0) return null;
  const row = filas[0];
  return {
    titulo: tipo === 'mascota' ? tituloDeReporte(row) : tituloDeAdopcion(row),
    descripcion: row.descripcion || '',
    imagen: (row.fotos && row.fotos[0]) || null,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const RUTA_OG = /^\/(mascota|adopcion)\/([0-9a-f-]{36})$/;
const TIENE_EXTENSION = /\.[a-z0-9]+$/i;

async function manejarFetch(request, env) {
  const url = new URL(request.url);

  // 1) assets: extensión de archivo o prefijos conocidos → tal cual.
  //    /borrar-cuenta (sin extensión) es un estático real exigido por Google
  //    Play (Data safety → Data deletion, debe abrir sin login ni app) — sin
  //    este pase explícito el fallback SPA del punto 2 lo pisaría con
  //    index.html. Hoy no está publicado (falta [[CORREO_CONTACTO]]), pero
  //    volverá, y en ese momento no debe quedar atrapado por el catch-all.
  if (
    TIENE_EXTENSION.test(url.pathname) ||
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/borrar-cuenta' ||
    url.pathname.startsWith('/borrar-cuenta/')
  ) {
    const respAsset = await env.ASSETS.fetch(request);
    if (url.pathname.startsWith('/_expo/static/')) {
      // Rol que cumplía public/_headers (deja de aplicar solo en advanced
      // mode): assets con hash en el nombre no cambian nunca, se cachean para
      // siempre. Cloudflare no lo agrega solo.
      const headers = new Headers(respAsset.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(respAsset.body, { status: respAsset.status, statusText: respAsset.statusText, headers });
    }
    return respAsset;
  }

  // 2) SPA: index.html como base de TODA ruta sin extensión.
  const indexResp = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
  const html = await indexResp.text();

  // 3) OG solo para /mascota/:uuid y /adopcion/:uuid — fallar ABIERTO.
  let extra = TAGS_PWA;
  const m = url.pathname.match(RUTA_OG);
  if (m) {
    try {
      const datos = await datosPublicos(m[1], m[2]);
      if (datos) {
        extra += armarMetaTags({ ...datos, url: url.toString() });
      }
    } catch (e) {
      // index pelado: un hipo de Supabase (o el timeout) no tira el sitio.
    }
  }

  return new Response(inyectarEnHead(html, extra), { headers: CABECERAS_HTML });
}

// Único export del módulo: el default handler que Cloudflare invoca, con las
// funciones puras colgadas como propiedades para poder testearlas desde jest
// (`worker.escaparHtml(...)`, `worker.TAGS_PWA`, etc.) sin agregar más named
// exports (ver nota más arriba sobre por qué eso rompe el runtime real).
export default {
  fetch: manejarFetch,
  escaparHtml,
  armarMetaTags,
  tituloDeReporte,
  tituloDeAdopcion,
  inyectarEnHead,
  TAGS_PWA,
};
