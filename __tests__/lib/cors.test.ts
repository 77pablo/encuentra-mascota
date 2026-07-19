// El allowlist de CORS de las Edge Functions. Vive en `supabase/functions/_shared`
// pero es puro a propósito, para poder probarlo desde acá: un error en esta
// expresión regular no rompe ningún test de la app y sin embargo le abriría la
// función a cualquier sitio de internet.
import {
  cabecerasCors,
  ORIGENES_DEV,
  origenPermitido,
} from '../../supabase/functions/_shared/cors';

const PROD = 'https://encuentras-mascota.pages.dev';
const PERMITIDOS = [PROD, ...ORIGENES_DEV];

describe('origenPermitido', () => {
  it('acepta el sitio de producción y los orígenes de desarrollo', () => {
    expect(origenPermitido(PROD, PERMITIDOS)).toBe(true);
    expect(origenPermitido('http://localhost:8091', PERMITIDOS)).toBe(true);
  });

  it('acepta las vistas previas de Cloudflare Pages', () => {
    // Cada deploy publica una URL distinta; sin esto las vistas previas romperían.
    expect(origenPermitido('https://a1b2c3.encuentras-mascota.pages.dev', PERMITIDOS)).toBe(true);
  });

  it('rechaza un dominio ajeno que contiene el nuestro', () => {
    // El caso que mata a un allowlist escrito con includes() o startsWith():
    // estos dominios son de otro dueño.
    expect(origenPermitido('https://encuentras-mascota.pages.dev.atacante.com', PERMITIDOS)).toBe(false);
    expect(origenPermitido('https://malo.com/encuentras-mascota.pages.dev', PERMITIDOS)).toBe(false);
    expect(origenPermitido('https://encuentras-mascota.pages.dev.evil.io', PERMITIDOS)).toBe(false);
  });

  it('rechaza el mismo dominio por http y un subdominio anidado', () => {
    expect(origenPermitido('http://encuentras-mascota.pages.dev', PERMITIDOS)).toBe(false);
    expect(origenPermitido('https://x.y.encuentras-mascota.pages.dev', PERMITIDOS)).toBe(false);
  });

  it('rechaza cualquier otro sitio y la falta de origen', () => {
    expect(origenPermitido('https://otra-cosa.com', PERMITIDOS)).toBe(false);
    expect(origenPermitido(null, PERMITIDOS)).toBe(false);
    expect(origenPermitido('', PERMITIDOS)).toBe(false);
  });
});

describe('cabecerasCors', () => {
  it('devuelve el origen exacto, nunca *', () => {
    const h = cabecerasCors(PROD, PERMITIDOS);
    expect(h['Access-Control-Allow-Origin']).toBe(PROD);
    // Con Authorization de por medio, `*` sería un error de seguridad.
    expect(Object.values(h)).not.toContain('*');
    expect(h.Vary).toBe('Origin');
  });

  it('no devuelve cabecera de permiso para un origen ajeno', () => {
    const h = cabecerasCors('https://otra-cosa.com', PERMITIDOS);
    expect(h['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('permite mandar content-type y authorization', () => {
    // supabase.functions.invoke() manda las dos; si faltan, el preflight falla.
    const permitidas = cabecerasCors(PROD, PERMITIDOS)['Access-Control-Allow-Headers'];
    expect(permitidas).toContain('content-type');
    expect(permitidas).toContain('authorization');
  });
});
