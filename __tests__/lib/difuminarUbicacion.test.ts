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
  it('corrige la longitud por latitud', () => {
    const PUNTA_ARENAS = { lat: -53.16, lng: -70.91 };
    const muestras = Array.from({ length: 500 }, () =>
      distanceKm(PUNTA_ARENAS, difuminarUbicacion(PUNTA_ARENAS)) * 1000,
    );
    expect(Math.max(...muestras)).toBeLessThanOrEqual(RADIO_DIFUMINADO_M + 1);
    expect(Math.max(...muestras)).toBeGreaterThan(RADIO_DIFUMINADO_M * 0.8);
  });

  it('respeta un radio explicito', () => {
    for (let i = 0; i < 200; i++) {
      const metros = distanceKm(SANTIAGO, difuminarUbicacion(SANTIAGO, 50)) * 1000;
      expect(metros).toBeLessThanOrEqual(51);
    }
  });
});
