// MAPA WEB — helpers puros del mapa de Leaflet (tanda 14, area C).
//
// POR QUE ESTA AREA EXISTE: `PlatformMap.web.tsx` era un placeholder que
// dibujaba un cuadro gris diciendo "el mapa solo esta disponible en la app
// movil", y su `Marker` devolvia null. Como la web es la UNICA plataforma
// publicada, toda la dimension geografica de la app era invisible para todos
// los usuarios reales: los datos se guardan, llegan al cliente y se descartan
// al dibujar.

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DELTA_MINIMO = 0.002;

// Exportada: la usa tambien PlatformMap.web.tsx a traves de popupHtml (y
// podria usarla cualquier otro string que Leaflet asigne como innerHTML).
export function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Contenido HTML del popup del pin. `L.bindPopup(string)` lo asigna como
// innerHTML, y title/description son texto libre de OTROS usuarios (la nota
// de un avistamiento, la descripcion de un reporte) que nada aguas arriba
// sanitiza. Sin escapar esto era un XSS almacenado (hallazgo CRITICAL 1 de
// la revision 4-ago). Logica pura y testeable, por eso vive aca y no en el
// componente.
export function popupHtml(title?: string, description?: string): string {
  const t = title ? escapar(title) : '';
  const d = description ? `<br/>${escapar(description)}` : '';
  return `<b>${t}</b>${d}`;
}

// Pin dibujado como SVG en un divIcon: sin archivos de imagen (los iconos por
// defecto de Leaflet se rompen con cualquier bundler porque resuelven rutas
// relativas), colorable, y numerable para el orden del rastro.
export function iconoHtml(color: string, etiqueta?: string | number): string {
  const texto =
    etiqueta === undefined || etiqueta === null || etiqueta === ''
      ? ''
      : `<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">${escapar(String(etiqueta))}</text>`;
  return (
    `<svg width="24" height="34" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M12 33C12 33 23 20.5 23 12A11 11 0 1 0 1 12c0 8.5 11 21 11 21z" fill="${escapar(color)}" stroke="#fff" stroke-width="2"/>` +
    texto +
    `</svg>`
  );
}

export function regionABounds(r: Region): [[number, number], [number, number]] {
  // Un delta de 0 daria un bounds de area nula y Leaflet haria zoom al maximo
  // sobre un punto; el minimo lo deja mirando una manzana.
  const dLat = Math.max(Math.abs(r.latitudeDelta), DELTA_MINIMO) / 2;
  const dLng = Math.max(Math.abs(r.longitudeDelta), DELTA_MINIMO) / 2;
  return [
    [r.latitude - dLat, r.longitude - dLng],
    [r.latitude + dLat, r.longitude + dLng],
  ];
}
