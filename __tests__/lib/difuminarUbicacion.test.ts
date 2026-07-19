import { difuminarUbicacion, RADIO_DIFUMINADO_M } from '../../src/lib/difuminarUbicacion';
import { distanceKm } from '../../src/lib/geo';

const SANTIAGO = { lat: -33.45, lng: -70.66 };

describe('difuminarUbicacion', () => {
  it('nunca devuelve el punto original', () => {
    for (let i = 0; i < 200; i++) {
      const movido = difuminarUbicacion(SANTIAGO);
      expect(movido.lat === SANTIAGO.lat && movido.lng === SANTIAGO.lng).toBe(false);
    }
  });

  it('se mantiene dentro del radio', () => {
    for (let i = 0; i < 500; i++) {
      const metros = distanceKm(SANTIAGO, difuminarUbicacion(SANTIAGO)) * 1000;
      expect(metros).toBeLessThanOrEqual(RADIO_DIFUMINADO_M + 1);
    }
  });

  it('dos llamadas con la misma entrada dan puntos distintos (no es redondeo)', () => {
    const a = difuminarUbicacion(SANTIAGO);
    const b = difuminarUbicacion(SANTIAGO);
    expect(a).not.toEqual(b);
  });

  // Con `r = R*u` los puntos se apelotonan en el centro y el original queda
  // demasiado adivinable. Con `r = R*sqrt(u)` la distribucion es uniforme en
  // AREA: la mitad de las muestras deben caer mas alla de R/sqrt(2) (~0.707R).
  it('reparte el punto por area, no concentrado en el centro', () => {
    const lejos = Array.from({ length: 2000 }, () => difuminarUbicacion(SANTIAGO))
      .map((p) => distanceKm(SANTIAGO, p) * 1000)
      .filter((m) => m > RADIO_DIFUMINADO_M * 0.707).length;
    expect(lejos).toBeGreaterThan(2000 * 0.4);
    expect(lejos).toBeLessThan(2000 * 0.6);
  });

  // Sin corregir por cos(lat) el desplazamiento en longitud se achica al
  // alejarse del ecuador: en Punta Arenas seria la mitad de lo que creemos.
  //
  // OJO: no mirar el maximo de una muestra con angulo aleatorio (como hacia
  // esta prueba antes). Con angulo al azar casi siempre hay alguna muestra,
  // de las 500, que cae cerca de un desplazamiento norte-sur puro y llega
  // a ~R sin pasar por el eje de longitud para nada: eso deja pasar una
  // implementacion que borro por completo la correccion por cos(lat), porque
  // el maximo observado sigue estando cerca de R aunque la longitud este
  // rota. Por eso aca se fija el angulo a este-oeste puro (Math.PI/2) con un
  // mock de Math.random, para que el desplazamiento caiga integro en el eje
  // de longitud y la correccion quede realmente bajo prueba.
  it('corrige la longitud por latitud', () => {
    const PUNTA_ARENAS = { lat: -53.16, lng: -70.91 };
    // Debe coincidir con la constante interna (no exportada) de
    // difuminarUbicacion.ts.
    const METROS_POR_GRADO_LAT = 111_320;

    // difuminarUbicacion llama Math.random() dos veces, en este orden:
    // 1) angulo = Math.random() * 2 * Math.PI  -> con 0.25 da PI/2 (este-oeste)
    // 2) distancia = radio * Math.sqrt(Math.random()) -> con 1 da radio maximo
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.25).mockReturnValueOnce(1);

    try {
      const movido = difuminarUbicacion(PUNTA_ARENAS);

      const metrosPorGradoLng =
        METROS_POR_GRADO_LAT * Math.cos((PUNTA_ARENAS.lat * Math.PI) / 180);
      const desplazamientoLngEsperado = RADIO_DIFUMINADO_M / metrosPorGradoLng;

      // Con angulo este-oeste puro, todo el desplazamiento debe verse en
      // longitud y usar el divisor corregido por cos(lat) (mas chico que
      // METROS_POR_GRADO_LAT, porque en Punta Arenas cos(lat) < 1). Si se
      // borra la correccion, el resultado usa METROS_POR_GRADO_LAT a secas y
      // el desplazamiento sale distinto (mas chico) del esperado aca.
      expect(movido.lng - PUNTA_ARENAS.lng).toBeCloseTo(desplazamientoLngEsperado, 9);
      // La latitud practicamente no deberia moverse: el angulo es este-oeste puro.
      expect(movido.lat).toBeCloseTo(PUNTA_ARENAS.lat, 9);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('respeta un radio explicito', () => {
    for (let i = 0; i < 200; i++) {
      const metros = distanceKm(SANTIAGO, difuminarUbicacion(SANTIAGO, 50)) * 1000;
      expect(metros).toBeLessThanOrEqual(51);
    }
  });
});
