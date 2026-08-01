import { debePreguntar, hayColumnaDeSeguimiento } from '../../src/lib/cierreCasos';

// CUÁNDO CORRESPONDE PREGUNTAR "¿APARECIÓ?" — lógica pura, el reloj entra por
// parámetro (convención de src/lib/recordatorios.ts).
//
// Preguntarle a alguien si apareció su mascota cuando no apareció duele. Por eso
// esto no es un recordatorio que se repite: son TRES momentos (3, 7 y 21 días) y
// cada uno se pregunta UNA vez. Si la persona ya respondió, se calla hasta el
// hito siguiente; y después del último, para siempre.

const base = {
  creado_en: '2026-07-01T00:00:00Z',
  activo: true,
  reunida_en: null,
  preguntado_en: null,
};
const enDias = (d: number) => new Date(Date.parse('2026-07-01T00:00:00Z') + d * 86400000);

describe('los tres momentos', () => {
  it('no pregunta antes del primer hito', () => {
    expect(debePreguntar(base, enDias(2)).preguntar).toBe(false);
  });

  it('pregunta a los 3 días', () => {
    expect(debePreguntar(base, enDias(3))).toEqual({ preguntar: true, hito: 3 });
  });

  it('NO vuelve a preguntar el mismo hito si ya respondió', () => {
    const yaPreguntado = { ...base, preguntado_en: enDias(3).toISOString() };
    expect(debePreguntar(yaPreguntado, enDias(4)).preguntar).toBe(false);
  });

  it('vuelve a preguntar en el hito siguiente', () => {
    const yaPreguntado = { ...base, preguntado_en: enDias(3).toISOString() };
    expect(debePreguntar(yaPreguntado, enDias(7))).toEqual({ preguntar: true, hito: 7 });
  });

  it('a las tres semanas pregunta la última vez', () => {
    const yaPreguntado = { ...base, preguntado_en: enDias(8).toISOString() };
    expect(debePreguntar(yaPreguntado, enDias(21))).toEqual({ preguntar: true, hito: 21 });
  });

  it('después del último hito NO vuelve a preguntar nunca más', () => {
    // Lo importante del archivo. Un reporte de tres meses que sigue abierto no
    // puede convertirse en una pregunta semanal: quien lo tiene abierto ya
    // sabe que su animal no volvió y no necesita que se lo recordemos.
    const respondioEn21 = { ...base, preguntado_en: enDias(21).toISOString() };
    for (const dia of [22, 30, 60, 120, 400]) {
      expect({ dia, ...debePreguntar(respondioEn21, enDias(dia)) }).toEqual({
        dia,
        preguntar: false,
        hito: null,
      });
    }
  });

  it('si nunca respondió, en el día 30 le pregunta el hito 21 (no el 3)', () => {
    // Quien abre la app por primera vez al mes tiene que ver UNA pregunta, la
    // que corresponde al tiempo transcurrido, no las tres acumuladas.
    expect(debePreguntar(base, enDias(30))).toEqual({ preguntar: true, hito: 21 });
  });
});

describe('cuándo hay que quedarse callado', () => {
  it('nunca pregunta si ya volvió a casa', () => {
    expect(debePreguntar({ ...base, reunida_en: enDias(1).toISOString() }, enDias(21)).preguntar).toBe(
      false,
    );
  });

  it('nunca pregunta sobre un reporte cerrado', () => {
    expect(debePreguntar({ ...base, activo: false }, enDias(7)).preguntar).toBe(false);
  });

  it('un reloj corrido hacia atrás no dispara la pregunta', () => {
    // `preguntado_en` lo escribe el servidor con now(); si el teléfono está
    // adelantado, la resta da negativa. Antes que preguntar de más, callarse.
    const enElFuturo = { ...base, preguntado_en: enDias(10).toISOString() };
    expect(debePreguntar(enElFuturo, enDias(7)).preguntar).toBe(false);
  });
});

describe('sin la migración 0049 la pregunta no existe', () => {
  // LA DEFENSA DE VERDAD. `getPet` lee con select('*'), así que la clave
  // `preguntado_en` VIENE en la fila (aunque valga null) solo si la columna
  // existe en la base. Si no está, el reporte no trae la clave y la tarjeta no
  // se dibuja: sin esto, cualquier reporte de más de 3 días mostraría la
  // pregunta y los tres botones fallarían con PGRST202 al tocarlos.
  it('un reporte sin la columna no está preparado para el seguimiento', () => {
    const { preguntado_en, ...sinColumna } = base;
    expect(hayColumnaDeSeguimiento(sinColumna)).toBe(false);
  });

  it('con la columna aplicada y todavía en null, sí lo está', () => {
    expect(hayColumnaDeSeguimiento(base)).toBe(true);
    expect(hayColumnaDeSeguimiento({ ...base, preguntado_en: enDias(3).toISOString() })).toBe(true);
  });

  it('sin la columna, `debePreguntar` tampoco inventa un hito', () => {
    // Cinturón y tiradores: aunque alguien se olvide del portero de arriba, la
    // lógica no puede tratar "no sé" como "nunca le pregunté".
    const { preguntado_en, ...sinColumna } = base;
    expect(debePreguntar(sinColumna, enDias(30)).preguntar).toBe(false);
  });
});
