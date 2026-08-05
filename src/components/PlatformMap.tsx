import React from 'react';
import RNMapView, { Marker as RNMarker } from 'react-native-maps';

// `etiqueta` es una prop NUESTRA (numera el rastro en el mapa web, tarea C2):
// `MapMarkerProps` de react-native-maps no la declara y no tiene índice, así
// que pasarla directo a `RNMarker` rompe tsc en nativo (el `import
// '../components/PlatformMap'` sin sufijo resuelve SIEMPRE a este archivo
// para tsc, con o sin moduleSuffixes, mientras que Metro sí elige
// `PlatformMap.web.tsx` en la web). Se declara acá aparte y se descarta antes
// de llegar a la vista nativa de verdad: en nativo el mapa se sigue viendo
// como hoy, sin números.
export function Marker({
  etiqueta,
  ...props
}: React.ComponentProps<typeof RNMarker> & { etiqueta?: string | number }) {
  return <RNMarker {...props} />;
}
export default RNMapView;
