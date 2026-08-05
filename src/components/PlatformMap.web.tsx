// PLATFORM MAP (web) — mapa real con Leaflet y teselas de OpenStreetMap.
//
// MISMA INTERFAZ que `react-native-maps`, a proposito: las seis pantallas que
// lo consumen (PetDetailScreen, PublishScreen, PublicarAdopcionScreen,
// AddSightingScreen, PublicPetScreen y ReportesMapa) NO cambian una linea.
// Por eso el evento se entrega como `e.nativeEvent.coordinate`, que es la
// forma de react-native-maps y no la de Leaflet.
//
// SIN LLAVE Y SIN FACTURA: Google Maps en web pide cuenta con billing. Las
// teselas de OSM no. A cambio, su licencia OBLIGA a atribuir, y la atribucion
// va prendida abajo a la derecha (no se saca).
//
// Los pines son divIcon con SVG en vez de los iconos por defecto de Leaflet,
// que se rompen con cualquier bundler porque resuelven rutas relativas.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { iconoHtml, popupHtml, regionABounds, Region } from '../lib/mapaWeb';

const MapaCtx = createContext<L.Map | null>(null);

export function Marker({
  coordinate, pinColor, title, description, draggable, onDragEnd, onCalloutPress, etiqueta,
}: any) {
  const mapa = useContext(MapaCtx);

  // Los handlers viven en un ref que se actualiza en CADA render (no en un
  // efecto con deps: eso disparó de mas, esto no dispara nada, solo deja el
  // valor al dia). El efecto de abajo NO lleva `onDragEnd`/`onCalloutPress`
  // en sus dependencias —recrear el marcador de Leaflet por cada handler
  // nuevo es innecesario—, asi que sin este ref los listeners de Leaflet
  // llamarian siempre a la clausura de la primera vez que se monto el
  // Marker (hallazgo IMPORTANT 3, revision 4-ago).
  const handlersRef = useRef({ onDragEnd, onCalloutPress });
  handlersRef.current = { onDragEnd, onCalloutPress };

  useEffect(() => {
    if (!mapa) return;
    const icon = L.divIcon({
      html: iconoHtml(pinColor ?? '#C62828', etiqueta),
      className: '',
      iconSize: [24, 34],
      iconAnchor: [12, 34],
      popupAnchor: [0, -30],
    });
    // `draggable` SI queda fuera del ref: ningun consumidor lo alterna hoy,
    // asi que cambiarlo en caliente (sin remontar el Marker) no esta
    // soportado a proposito (hallazgo IMPORTANT 3, revision 4-ago).
    const m = L.marker([coordinate.latitude, coordinate.longitude], {
      icon,
      draggable: !!draggable,
    }).addTo(mapa);

    if (title || description) {
      // `popupHtml` escapa title/description: son texto libre de OTROS
      // usuarios (nota de avistamiento, descripcion de reporte) y
      // `bindPopup(string)` lo asigna como innerHTML — sin escapar era un
      // XSS almacenado (hallazgo CRITICAL 1, revision 4-ago).
      m.bindPopup(popupHtml(title, description));

      let popupEl: HTMLElement | null = null;
      const alClicPopup = (ev: MouseEvent) => {
        // El boton de cerrar (x) vive DENTRO del DOM del popup: sin este
        // filtro, cerrar el popup dispara onCalloutPress igual que tocar
        // el contenido (en ReportesMapa eso navega a PetDetail solo por
        // cerrar). Hallazgo IMPORTANT 2, revision 4-ago.
        if ((ev.target as Element).closest('.leaflet-popup-close-button')) return;
        handlersRef.current.onCalloutPress?.();
      };
      m.on('popupopen', () => {
        const el = m.getPopup()?.getElement();
        if (!el) return;
        // Leaflet reutiliza el mismo elemento del popup en cada apertura:
        // sin sacar el listener anterior se apilan uno encima del otro y
        // un click termina llamando a onCalloutPress varias veces.
        if (popupEl) popupEl.removeEventListener('click', alClicPopup);
        popupEl = el;
        el.addEventListener('click', alClicPopup); // sin `{ once: true }`: debe sobrevivir a mas de un click
      });
    }

    m.on('dragend', () => {
      const p = m.getLatLng();
      // Forma de react-native-maps, no de Leaflet: los llamadores ya leen
      // `e.nativeEvent.coordinate` y no deben enterarse del cambio.
      handlersRef.current.onDragEnd?.({ nativeEvent: { coordinate: { latitude: p.lat, longitude: p.lng } } });
    });
    return () => { m.remove(); };
  }, [mapa, coordinate.latitude, coordinate.longitude, pinColor, title, description, etiqueta]);

  return null;
}

export default function MapView({ style, region, initialRegion, onPress, children }: any) {
  const [mapa, setMapa] = useState<L.Map | null>(null);
  // Las regiones iniciales se leen UNA vez, al montar. Guardadas en un ref
  // para no re-montar el mapa cuando el llamador re-renderiza con un objeto
  // nuevo pero equivalente (`region={{...}}` crea uno distinto cada render).
  const inicial = useRef(region ?? initialRegion);

  // REF CALLBACK, no `useRef` + `useEffect([div.current])`: un efecto que
  // depende de `.current` no se vuelve a disparar cuando el ref se llena
  // —mutar un ref no re-renderiza— asi que el mapa puede no montarse nunca.
  const montar = useCallback((div: HTMLDivElement | null) => {
    if (!div) return;
    const r: Region = inicial.current ?? {
      latitude: -33.45, longitude: -70.66, latitudeDelta: 0.3, longitudeDelta: 0.3,
    };
    const m = L.map(div, { attributionControl: true });
    m.fitBounds(regionABounds(r));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>',
    }).addTo(m);
    setMapa(m);
  }, []);

  // El mapa se destruye al desmontar el componente, no al re-renderizar.
  useEffect(() => () => { mapa?.remove(); }, [mapa]);

  // `region` controlada: cuando el llamador la cambia (por ejemplo
  // AddSightingScreen al usar "mi ubicación"), el mapa la sigue.
  useEffect(() => {
    if (mapa && region) mapa.fitBounds(regionABounds(region));
  }, [mapa, region?.latitude, region?.longitude, region?.latitudeDelta]);

  useEffect(() => {
    if (!mapa || !onPress) return;
    const h = (e: L.LeafletMouseEvent) =>
      onPress({ nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } } });
    mapa.on('click', h);
    return () => { mapa.off('click', h); };
  }, [mapa, onPress]);

  return (
    <div ref={montar} style={{ ...(style ?? {}), minHeight: 180 }}>
      {/* Los hijos se montan recien con el mapa listo: un Marker sin mapa no
          tiene donde agregarse. */}
      <MapaCtx.Provider value={mapa}>{mapa ? children : null}</MapaCtx.Provider>
    </div>
  );
}
