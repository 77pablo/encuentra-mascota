// WIDGET INSTITUCIONAL (Tanda 20) — lógica pura para generar el código embed.
//
// Un tercero (veterinaria, refugio, municipio) pega el `<iframe>` en su sitio y
// muestra las mascotas perdidas/encontradas de una comuna, alimentado por
// nosotros. El widget vive en `public/widget/index.html` (servido por el worker).

const ANCHO_DEFAULT = 360;
const ALTO_DEFAULT = 520;

// URL de preview / src del iframe. La comuna va SIEMPRE encodeada: es texto que
// termina en un atributo HTML y en un query string.
export function urlWidget(origin: string, comuna: string, limite?: number): string {
  const base = `${origin.replace(/\/$/, '')}/widget/?comuna=${encodeURIComponent(comuna)}`;
  return limite ? `${base}&limite=${limite}` : base;
}

// El snippet `<iframe>` listo para copiar. `encodeURIComponent` ya deja la
// comuna sin comillas ni `<`/`>`/`&` peligrosos, así que la URL es segura
// dentro del atributo `src`.
export function armarCodigoEmbed(origin: string, comuna: string, limite?: number): string {
  const src = urlWidget(origin, comuna, limite);
  const titulo = `Mascotas perdidas en ${comuna}`.replace(/"/g, '');
  return (
    `<iframe src="${src}" ` +
    `width="${ANCHO_DEFAULT}" height="${ALTO_DEFAULT}" ` +
    `style="border:1px solid #e5e5e5;border-radius:12px;max-width:100%" ` +
    `title="${titulo}" loading="lazy"></iframe>`
  );
}
