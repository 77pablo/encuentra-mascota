// Manejo del campo "red social" del perfil. La columna `red_social` (una sola,
// tipo texto) guarda una URL completa al perfil del usuario. Este modulo la arma
// desde (plataforma + usuario) y la interpreta de vuelta para mostrarla como un
// link tocable. Los valores viejos (texto suelto, ej "@77.pvblo") no son URLs:
// se muestran igual, pero no son tocables (url = null).

export type RedSocialTipo = 'instagram' | 'facebook' | 'tiktok' | 'otro';

const BASE: Record<Exclude<RedSocialTipo, 'otro'>, string> = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  // TikTok identifica los perfiles con arroba en la ruta.
  tiktok: 'https://tiktok.com/@',
};

const ICONO: Record<RedSocialTipo, string> = {
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  tiktok: 'logo-tiktok',
  otro: 'share-social',
};

function esUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

// Arma la URL del perfil a partir de la plataforma y el usuario que escribio la
// persona. Limpia arrobas y espacios. Si ya pegaron un link completo, lo respeta
// tal cual (sin importar la plataforma elegida). Sin usuario devuelve ''.
export function construirUrlRedSocial(tipo: RedSocialTipo, usuario: string): string {
  const u = (usuario ?? '').trim();
  if (!u) return '';
  if (esUrl(u)) return u;
  if (tipo === 'otro') return `https://${u.replace(/^\/+/, '')}`;
  const handle = u.replace(/^@+/, '');
  return `${BASE[tipo]}${handle}`;
}

export interface RedSocialParseada {
  tipo: RedSocialTipo;
  // Texto para mostrar: "@usuario" en Instagram/TikTok, el usuario a secas en
  // Facebook, o el dominio+ruta en "otro".
  usuario: string;
  // La URL tocable, o null si el valor guardado es texto viejo no navegable.
  url: string | null;
}

// Interpreta el valor guardado en `red_social`. Devuelve null si esta vacio.
export function parseRedSocial(valor: string | null | undefined): RedSocialParseada | null {
  const v = (valor ?? '').trim();
  if (!v) return null;

  // Texto viejo (no es URL): se muestra, pero no es tocable.
  if (!esUrl(v)) return { tipo: 'otro', usuario: v, url: null };

  const sinScheme = v.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const barra = sinScheme.indexOf('/');
  const host = (barra === -1 ? sinScheme : sinScheme.slice(0, barra)).toLowerCase();
  const path = barra === -1 ? '' : sinScheme.slice(barra + 1);

  let tipo: RedSocialTipo = 'otro';
  if (host.includes('instagram.com')) tipo = 'instagram';
  else if (host.includes('facebook.com') || host.includes('fb.com')) tipo = 'facebook';
  else if (host.includes('tiktok.com')) tipo = 'tiktok';

  if (tipo === 'otro') return { tipo, usuario: sinScheme, url: v };

  const handle = path.replace(/^@+/, '');
  const usuario = tipo === 'facebook' ? handle : `@${handle}`;
  return { tipo, usuario, url: v };
}

export function iconoRedSocial(tipo: RedSocialTipo): string {
  return ICONO[tipo];
}
