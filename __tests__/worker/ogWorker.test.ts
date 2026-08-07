// Tests de la lógica pura + del fetch handler de public/_worker.js (Agente A).
// El worker es JS plano autónomo (sin imports de la app ni de node) que corre
// en Cloudflare Pages; acá lo importamos como módulo para testear sus partes
// puras y el handler completo con un env.ASSETS falso.
// Único export del módulo: el runtime real de Cloudflare Workers valida cada
// named export y exige que sea función o ExportedHandler — un `export const`
// de texto plano (TAGS_PWA) lo tira con "Incorrect type for map entry...".
// Por eso el worker solo tiene `export default {...}` con todo colgado ahí.
import worker from '../../public/_worker.js';

const { escaparHtml, armarMetaTags, tituloDeReporte, tituloDeAdopcion, inyectarEnHead, TAGS_PWA } = worker;

const INDEX_HTML = '<!doctype html><html><head><title>Encuentra tu Mascota</title></head><body><div id="root"></div></body></html>';

function envAssetsFalso({ onFetch }: { onFetch?: (req: Request) => void } = {}) {
  return {
    ASSETS: {
      fetch: jest.fn(async (req: Request) => {
        onFetch?.(req);
        const u = new URL(req.url);
        if (u.pathname === '/') {
          return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return new Response('contenido-del-asset', { headers: { 'content-type': 'application/octet-stream' } });
      }),
    },
  };
}

describe('escaparHtml', () => {
  it('escapa & < > " \'', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('deja intacto el texto chileno con tildes y ñ', () => {
    expect(escaparHtml('Perdida en Ñuñoa, cerca de Maipú')).toBe('Perdida en Ñuñoa, cerca de Maipú');
  });

  it('convierte valores no-string y null/undefined a texto vacío o su String()', () => {
    expect(escaparHtml(null as unknown as string)).toBe('');
    expect(escaparHtml(undefined as unknown as string)).toBe('');
  });
});

describe('armarMetaTags', () => {
  it('escapa una descripción con intento de XSS', () => {
    const html = armarMetaTags({
      titulo: 'Luna',
      descripcion: '"><script>alert(1)</script>',
      imagen: null,
      url: 'https://example.com/mascota/1',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;');
  });

  it('recorta la descripción a ~150 caracteres con "…"', () => {
    const larga = 'a'.repeat(300);
    const html = armarMetaTags({ titulo: 'Luna', descripcion: larga, imagen: null, url: 'https://x.cl' });
    const match = html.match(/og:description" content="([^"]*)"/);
    expect(match).not.toBeNull();
    const contenido = match![1];
    expect(contenido.endsWith('…')).toBe(true);
    expect(contenido.length).toBeLessThanOrEqual(151);
  });

  it('no recorta descripciones cortas ni les agrega "…"', () => {
    const html = armarMetaTags({ titulo: 'Luna', descripcion: 'Perrita cariñosa', imagen: null, url: 'https://x.cl' });
    expect(html).toContain('Perrita cariñosa');
    expect(html).not.toContain('Perrita cariñosa…');
  });

  it('incluye título, url, tipo, site_name y las tags de twitter', () => {
    const html = armarMetaTags({ titulo: 'Luna', descripcion: 'desc', imagen: 'https://x.cl/f.jpg', url: 'https://x.cl/mascota/1' });
    expect(html).toContain('og:title" content="Luna"');
    expect(html).toContain('og:image" content="https://x.cl/f.jpg"');
    expect(html).toContain('og:url" content="https://x.cl/mascota/1"');
    expect(html).toContain('og:type" content="website"');
    expect(html).toContain('og:site_name"');
    expect(html).toContain('twitter:card" content="summary_large_image"');
    expect(html).toContain('twitter:image" content="https://x.cl/f.jpg"');
  });

  it('sin imagen no emite og:image ni twitter:image', () => {
    const html = armarMetaTags({ titulo: 'Luna', descripcion: 'desc', imagen: null, url: 'https://x.cl' });
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('twitter:image');
  });

  it('sin descripción no emite og:description ni twitter:description (en vez de content="")', () => {
    const html = armarMetaTags({ titulo: 'Luna', descripcion: '', imagen: null, url: 'https://x.cl' });
    expect(html).not.toContain('og:description');
    expect(html).not.toContain('twitter:description');
    // El resto de las tags fijas se siguen emitiendo igual.
    expect(html).toContain('og:title" content="Luna"');
  });
});

describe('tituloDeReporte', () => {
  it('perdida con comuna', () => {
    const t = tituloDeReporte({ nombre: 'Luna', especie: 'perro', estado: 'perdida', comuna: 'Maipú', reunida_en: null });
    expect(t).toBe('🔴 PERDIDA en Maipú — Perro «Luna»');
  });

  it('encontrada con comuna', () => {
    const t = tituloDeReporte({ nombre: 'Luna', especie: 'gato', estado: 'encontrada', comuna: 'Ñuñoa', reunida_en: null });
    expect(t).toBe('🟢 ENCONTRADA en Ñuñoa — Gato «Luna»');
  });

  it('sin comuna', () => {
    const t = tituloDeReporte({ nombre: 'Luna', especie: 'perro', estado: 'perdida', comuna: null, reunida_en: null });
    expect(t).toBe('🔴 PERDIDA — Perro «Luna»');
  });

  it('reunida (reunida_en presente) titula "¡Volvió a casa!" sin importar el estado', () => {
    const t = tituloDeReporte({ nombre: 'Luna', especie: 'perro', estado: 'encontrada', comuna: 'Maipú', reunida_en: '2026-07-20T10:00:00Z' });
    expect(t).toBe('¡Volvió a casa! Perro «Luna»');
  });
});

describe('tituloDeAdopcion', () => {
  it('normal con comuna', () => {
    expect(tituloDeAdopcion({ nombre: 'Luna', comuna: 'Ñuñoa', adoptada_en: null })).toBe('Luna busca hogar en Ñuñoa');
  });

  it('sin comuna', () => {
    expect(tituloDeAdopcion({ nombre: 'Luna', comuna: null, adoptada_en: null })).toBe('Luna busca hogar');
  });

  it('adoptada', () => {
    expect(tituloDeAdopcion({ nombre: 'Luna', comuna: 'Ñuñoa', adoptada_en: '2026-07-20T10:00:00Z' })).toBe('¡Ya encontró familia! Luna');
  });
});

describe('inyectarEnHead', () => {
  it('inserta el extra justo antes de </head>', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const out = inyectarEnHead(html, '<meta name="x" content="y">');
    expect(out).toBe('<html><head><title>x</title><meta name="x" content="y"></head><body></body></html>');
  });

  it('sin </head>, devuelve el html intacto', () => {
    const html = '<html><body>sin head</body></html>';
    expect(inyectarEnHead(html, '<meta name="x">')).toBe(html);
  });

  it('con extra vacío, devuelve el html intacto', () => {
    const html = '<html><head></head><body></body></html>';
    expect(inyectarEnHead(html, '')).toBe(html);
  });
});

describe('TAGS_PWA', () => {
  it('contiene las referencias fijas de la interfaz A↔B', () => {
    expect(TAGS_PWA).toContain('href="/manifest.webmanifest"');
    expect(TAGS_PWA).toContain('name="theme-color"');
    expect(TAGS_PWA).toContain('href="/icons/icono-180.png"');
    expect(TAGS_PWA).toContain('src="/registrar-sw.js" defer');
  });
});

describe('worker fetch handler', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('una ruta de asset (con extensión) pasa directo a env.ASSETS.fetch', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/assets/logo.png');
    const res = await worker.fetch(req, env);
    expect(await res.text()).toBe('contenido-del-asset');
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
  });

  it('una ruta de /_expo/ pasa directo a env.ASSETS.fetch', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/_expo/static/js/index-abc123.js');
    await worker.fetch(req, env);
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1);
  });

  it('una ruta SPA sin extensión devuelve el index con TAGS_PWA inyectado', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/alguna-ruta-cualquiera');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('<title>Encuentra tu Mascota</title>');
  });

  it('todas las respuestas HTML llevan las 5 cabeceras de seguridad', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/alguna-ruta');
    const res = await worker.fetch(req, env);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('Permissions-Policy')).toBe('geolocation=(self), camera=(self), microphone=(), payment=()');
  });

  it('/borrar-cuenta (estático sin extensión) pasa a env.ASSETS.fetch, no al fallback SPA', async () => {
    const env = {
      ASSETS: {
        fetch: jest.fn(async (req: Request) => {
          const u = new URL(req.url);
          if (u.pathname === '/borrar-cuenta' || u.pathname === '/borrar-cuenta/') {
            return new Response('<html>borrar-cuenta estático</html>', {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }
          if (u.pathname === '/') {
            return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
          }
          return new Response('contenido-del-asset');
        }),
      },
    };
    const req = new Request('https://x.cl/borrar-cuenta');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).toBe('<html>borrar-cuenta estático</html>');
    expect(html).not.toContain('href="/manifest.webmanifest"'); // no pasó por el fallback SPA
  });

  it('/borrar-cuenta/ (con barra final) también pasa a env.ASSETS.fetch', async () => {
    const env = {
      ASSETS: {
        fetch: jest.fn(async (req: Request) => {
          const u = new URL(req.url);
          if (u.pathname.startsWith('/borrar-cuenta')) {
            return new Response('<html>borrar-cuenta estático</html>', {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }
          return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }),
      },
    };
    const req = new Request('https://x.cl/borrar-cuenta/');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).toBe('<html>borrar-cuenta estático</html>');
  });

  // Las páginas legales se generan con scripts/generar-legales.js desde
  // docs/legal/*.md y salen a public/privacidad/ y public/terminos/. Google
  // Play exige una URL pública de política de privacidad: si el catch-all SPA
  // se las come, el revisor de la tienda ve la app en vez del documento y el
  // envío se rechaza. Es exactamente el mismo pase que necesitó /borrar-cuenta.
  it.each([
    ['/privacidad', '<html>privacidad estática</html>'],
    ['/privacidad/', '<html>privacidad estática</html>'],
    ['/terminos', '<html>términos estáticos</html>'],
    ['/terminos/', '<html>términos estáticos</html>'],
  ])('%s pasa a env.ASSETS.fetch, no al fallback SPA', async (ruta, esperado) => {
    const env = {
      ASSETS: {
        fetch: jest.fn(async (req: Request) => {
          const u = new URL(req.url);
          if (u.pathname.startsWith('/privacidad')) {
            return new Response('<html>privacidad estática</html>', {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }
          if (u.pathname.startsWith('/terminos')) {
            return new Response('<html>términos estáticos</html>', {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }
          return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }),
      },
    };
    const res = await worker.fetch(new Request('https://x.cl' + ruta), env);
    const html = await res.text();
    expect(html).toBe(esperado);
    expect(html).not.toContain('href="/manifest.webmanifest"'); // no pasó por el fallback SPA
  });

  // El pase es por ruta exacta o con barra: una ruta que apenas EMPIEZA igual
  // no debe escaparse del SPA, o cualquier pantalla futura de la app que se
  // llame parecido dejaría de funcionar.
  it.each(['/privacidad-de-datos', '/terminosyservicios'])(
    '%s NO se toma como estático y sigue al fallback SPA',
    async (ruta) => {
      const env = envAssetsFalso();
      const res = await worker.fetch(new Request('https://x.cl' + ruta), env);
      const html = await res.text();
      expect(html).toContain('<div id="root">');
    },
  );

  // Widget institucional (Tanda 20): /widget/ tiene que servir el HTML estático
  // (public/widget/index.html), no el SPA — un tercero lo embebe por iframe.
  it.each(['/widget', '/widget/'])(
    '%s pasa a env.ASSETS.fetch, no al fallback SPA',
    async (ruta) => {
      const env = {
        ASSETS: {
          fetch: jest.fn(async (req: Request) => {
            const u = new URL(req.url);
            if (u.pathname.startsWith('/widget')) {
              return new Response('<html>widget estático</html>', {
                headers: { 'content-type': 'text/html; charset=utf-8' },
              });
            }
            return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
          }),
        },
      };
      const res = await worker.fetch(new Request('https://x.cl' + ruta + '?comuna=Nunoa'), env);
      expect(await res.text()).toBe('<html>widget estático</html>');
    },
  );

  it('/widgets-x NO se toma como estático (no se escapa del SPA)', async () => {
    const env = envAssetsFalso();
    const res = await worker.fetch(new Request('https://x.cl/widgets-x'), env);
    expect(await res.text()).toContain('<div id="root">');
  });

  // Página pública de impacto (Tanda 21): estática, servida por ASSETS.
  it.each(['/impacto', '/impacto/'])(
    '%s pasa a env.ASSETS.fetch, no al fallback SPA',
    async (ruta) => {
      const env = {
        ASSETS: {
          fetch: jest.fn(async (req: Request) => {
            const u = new URL(req.url);
            if (u.pathname.startsWith('/impacto')) {
              return new Response('<html>impacto estático</html>', {
                headers: { 'content-type': 'text/html; charset=utf-8' },
              });
            }
            return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
          }),
        },
      };
      const res = await worker.fetch(new Request('https://x.cl' + ruta), env);
      expect(await res.text()).toBe('<html>impacto estático</html>');
    },
  );

  it('/impactos-x NO se toma como estático (no se escapa del SPA)', async () => {
    const env = envAssetsFalso();
    const res = await worker.fetch(new Request('https://x.cl/impactos-x'), env);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('las respuestas HTML llevan Cache-Control: no-cache (que un intermediario no retenga OG viejas)', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/alguna-ruta');
    const res = await worker.fetch(req, env);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('/_expo/static/* reemite la respuesta de ASSETS con Cache-Control inmutable de 1 año', async () => {
    const env = {
      ASSETS: {
        fetch: jest.fn(async () => new Response('contenido-del-bundle', {
          headers: { 'content-type': 'application/javascript' },
        })),
      },
    };
    const req = new Request('https://x.cl/_expo/static/js/web/entry-abc123.js');
    const res = await worker.fetch(req, env);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(await res.text()).toBe('contenido-del-bundle');
  });

  it('un asset fuera de /_expo/static/ (p. ej. /assets/logo.png) NO recibe el Cache-Control inmutable agregado', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/assets/logo.png');
    const res = await worker.fetch(req, env);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('/mascota/:uuid con Supabase colgado falla abierto: index pelado en <3s', async () => {
    global.fetch = jest.fn((_url: string, opts: RequestInit) => new Promise((_resolve, reject) => {
      opts.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/mascota/11111111-1111-1111-1111-111111111111');
    const inicio = Date.now();
    const res = await worker.fetch(req, env);
    const demora = Date.now() - inicio;
    const html = await res.text();
    expect(demora).toBeLessThan(3000);
    expect(html).not.toContain('og:title');
    expect(html).toContain('href="/manifest.webmanifest"');
  }, 5000);

  it('/mascota/:uuid con datos reales agrega las tags OG escapadas', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify([{
      nombre: 'Luna',
      especie: 'perro',
      estado: 'perdida',
      comuna: 'Maipú',
      fotos: ['https://x.cl/f.jpg'],
      descripcion: '"><script>alert(1)</script>',
      reunida_en: null,
    }]), { status: 200 })) as unknown as typeof fetch;
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/mascota/11111111-1111-1111-1111-111111111111');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).toContain('🔴 PERDIDA en Maipú — Perro «Luna»');
    expect(html).toContain('og:image" content="https://x.cl/f.jpg"');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('/mascota/:uuid sin filas (borrado/oculto) sirve index pelado', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/mascota/11111111-1111-1111-1111-111111111111');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).not.toContain('og:title');
  });

  it('un id con caracteres raros no rompe (no matchea, cae a SPA)', async () => {
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/mascota/no-es-un-uuid-!!@@');
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/manifest.webmanifest"');
  });

  it('/adopcion/:uuid adoptada titula "¡Ya encontró familia!"', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify([{
      nombre: 'Rocky',
      especie: 'perro',
      edad: 'cachorro',
      tamano: 'mediano',
      comuna: 'Ñuñoa',
      fotos: ['https://x.cl/rocky.jpg'],
      descripcion: 'Muy juguetón',
      adoptada_en: '2026-07-20T10:00:00Z',
    }]), { status: 200 })) as unknown as typeof fetch;
    const env = envAssetsFalso();
    const req = new Request('https://x.cl/adopcion/22222222-2222-2222-2222-222222222222');
    const res = await worker.fetch(req, env);
    const html = await res.text();
    expect(html).toContain('¡Ya encontró familia! Rocky');
  });
});
