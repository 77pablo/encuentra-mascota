import { LatLng } from './geo';

// Cuanto movemos el punto que se publica. 250 m alcanza para tapar la cuadra
// sin estorbar la busqueda: quien busca a su mascota mira radios de kilometros.
export const RADIO_DIFUMINADO_M = 250;

const METROS_POR_GRADO_LAT = 111_320;

// Mueve el punto a un lugar aleatorio dentro de un circulo, para no publicar la
// casa de quien reporta: los reportes se ven SIN CUENTA y la coordenada por
// defecto es la del GPS de quien publica.
//
// Es aleatorio y no redondeo a proposito. El redondeo es reversible: con varios
// reportes de la misma persona se recupera el punto real cruzandolos. Un
// desplazamiento aleatorio independiente por reporte, no.
//
// Se llama UNA SOLA VEZ, al escribir en la base (no al mostrar), y se guarda
// solo el resultado. Asi el pin queda fijo y nadie puede promediar varias
// lecturas para volver al original.
export function difuminarUbicacion(punto: LatLng, radioMetros = RADIO_DIFUMINADO_M): LatLng {
  const angulo = Math.random() * 2 * Math.PI;
  // sqrt(u) reparte los puntos de forma uniforme en AREA. Con u a secas se
  // apelotonarian cerca del centro, o sea cerca de la casa.
  const distancia = radioMetros * Math.sqrt(Math.random());

  const desplazamientoLat = (distancia * Math.cos(angulo)) / METROS_POR_GRADO_LAT;
  // Un grado de longitud mide menos a medida que uno se aleja del ecuador. Sin
  // este coseno, en el sur de Chile moveriamos el punto bastante menos de lo
  // que creemos.
  const metrosPorGradoLng = METROS_POR_GRADO_LAT * Math.cos((punto.lat * Math.PI) / 180);
  const desplazamientoLng = (distancia * Math.sin(angulo)) / metrosPorGradoLng;

  return {
    lat: punto.lat + desplazamientoLat,
    lng: punto.lng + desplazamientoLng,
  };
}
