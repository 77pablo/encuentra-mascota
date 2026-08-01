import {
  AMBITOS,
  MARGEN_VECINDAD,
  OPCIONES_RADIO_EXPLORAR,
  RADIO_EXPLORAR_MAX_KM,
  ajustarAOpciones,
  esAmbito,
  preguntarAmbito,
  radioExplorarSugeridoKm,
  radioLabel,
  radioSugerido,
} from '../../src/lib/radioSugerido';

// EL RADIO NO PUEDE SER EL MISMO PARA TODOS.
//
// Los números vienen del estudio de la U. de Queensland + Missing Animal
// Response (n=1.232 gatos): mediana de 315 m para un gato con acceso al
// exterior y de 50 m para un gato de interior escapado; los perros se mueven
// 1-2 km. Mediana de tiempo hasta recuperarla: 2 días perros, 5 días gatos.
//
// Estos tests no repiten la tabla del módulo (sería tautológico): comprueban
// las RELACIONES que el estudio impone —quién es más chico que quién, cuánto,
// y qué pasa al pasar los días— y el contrato con las pantallas que la usan.

describe('radioSugerido', () => {
  it('el gato de interior es MUCHO más chico que el gato con exterior', () => {
    const interior = radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 });
    const exterior = radioSugerido({ especie: 'gato', ambito: 'exterior', dias: 0 });
    // La mediana del estudio es 50 m contra 315 m: algo más de 6 veces. El
    // radio sugerido tiene que reflejar ese orden de magnitud, no empatar.
    expect(interior.km).toBeLessThan(exterior.km / 3);
  });

  it('el gato de interior cabe en la manzana y el perro no', () => {
    const gatoAdentro = radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 });
    const perro = radioSugerido({ especie: 'perro', dias: 0 });
    // Puerta por puerta: el radio del gato de interior tiene que ser caminable
    // (menos de medio km). Si esto se afloja, "buscá en tu cuadra" deja de ser
    // cierto y el consejo de la UI miente.
    expect(gatoAdentro.km).toBeLessThanOrEqual(0.5);
    // El perro camina 1-2 km sin despeinarse: su radio tiene que superarlos.
    expect(perro.km).toBeGreaterThanOrEqual(2);
  });

  it('sin ámbito, el gato usa el caso ANCHO (conservador), no el chico', () => {
    const sinAmbito = radioSugerido({ especie: 'gato', dias: 0 });
    const exterior = radioSugerido({ especie: 'gato', ambito: 'exterior', dias: 0 });
    const interior = radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 });
    // Omitir la pregunta NO puede achicarle la búsqueda a nadie: quien no
    // contesta se queda con el radio grande.
    expect(sinAmbito.km).toBe(exterior.km);
    expect(sinAmbito.km).toBeGreaterThan(interior.km);
  });

  it('"otro" (desconocido) es el más ancho de todos', () => {
    const otro = radioSugerido({ especie: 'otro', dias: 0 });
    for (const otra of ['perro', 'gato'] as const) {
      expect(otro.km).toBeGreaterThanOrEqual(radioSugerido({ especie: otra, dias: 0 }).km);
    }
  });

  it('el radio se amplía con los días, y al perro le pasa ANTES que al gato', () => {
    const perro0 = radioSugerido({ especie: 'perro', dias: 0 });
    const perro3 = radioSugerido({ especie: 'perro', dias: 3 });
    const gato3 = radioSugerido({ especie: 'gato', ambito: 'interior', dias: 3 });
    // Mediana de recuperación: 2 días perros. Al tercer día el perro ya tiene
    // que estar buscando más lejos.
    expect(perro3.km).toBeGreaterThan(perro0.km);
    // Mediana de 5 días en gatos: al tercer día todavía no toca ampliar.
    expect(gato3.km).toBe(radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 }).km);
  });

  it('la ampliación es monótona: más días nunca achica el radio', () => {
    for (const especie of ['perro', 'gato', 'otro'] as const) {
      let previo = 0;
      for (let dias = 0; dias <= 60; dias++) {
        const { km } = radioSugerido({ especie, dias });
        expect(km).toBeGreaterThanOrEqual(previo);
        previo = km;
      }
    }
  });

  it('la ampliación tiene tope: no termina buscando en todo Chile', () => {
    for (const especie of ['perro', 'gato', 'otro'] as const) {
      const lejano = radioSugerido({ especie, dias: 3650 });
      expect(lejano.km).toBe(lejano.topeKm);
      expect(lejano.enElTope).toBe(true);
      expect(lejano.topeKm).toBeLessThanOrEqual(50);
    }
  });

  it('días raros (negativos, NaN, decimales) no rompen ni achican', () => {
    const base = radioSugerido({ especie: 'perro', dias: 0 }).km;
    expect(radioSugerido({ especie: 'perro', dias: -7 }).km).toBe(base);
    expect(radioSugerido({ especie: 'perro', dias: NaN }).km).toBe(base);
    expect(radioSugerido({ especie: 'perro', dias: 1.9 }).km).toBe(base);
    expect(radioSugerido({ especie: 'perro' }).km).toBe(base);
  });

  it('el radio del día 0 cubre HOLGADO la mediana del estudio', () => {
    // Las medianas están escritas acá, no importadas del módulo: son el dato
    // externo (Queensland + Missing Animal Response, n=1.232) contra el que se
    // mide la tabla. Una mediana es el punto donde la MITAD de los casos
    // quedaron más lejos: buscar solo hasta ahí dejaría afuera a la mitad de
    // las mascotas, así que el radio inicial tiene que ser un múltiplo.
    const MEDIANA_GATO_INTERIOR_KM = 0.05; // 50 m
    const MEDIANA_GATO_EXTERIOR_KM = 0.315; // 315 m
    const interior = radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 });
    const exterior = radioSugerido({ especie: 'gato', ambito: 'exterior', dias: 0 });
    expect(interior.inicialKm).toBeGreaterThanOrEqual(MEDIANA_GATO_INTERIOR_KM * 3);
    expect(exterior.inicialKm).toBeGreaterThanOrEqual(MEDIANA_GATO_EXTERIOR_KM * 3);
    // Holgado, no disparatado: si el "múltiplo" fuera 100×, el gato de interior
    // volvería a tener el radio de un perro y no habríamos calibrado nada.
    expect(interior.inicialKm).toBeLessThanOrEqual(MEDIANA_GATO_INTERIOR_KM * 10);
    expect(exterior.inicialKm).toBeLessThanOrEqual(MEDIANA_GATO_EXTERIOR_KM * 10);
  });

  it('el motivo es corto, humano y distinto por caso', () => {
    const casos = [
      radioSugerido({ especie: 'gato', ambito: 'interior', dias: 0 }),
      radioSugerido({ especie: 'gato', ambito: 'exterior', dias: 0 }),
      radioSugerido({ especie: 'perro', dias: 0 }),
      radioSugerido({ especie: 'otro', dias: 0 }),
    ];
    const motivos = casos.map((c) => c.motivo);
    // Cuatro textos distintos: si dos casos dicen lo mismo, la explicación no
    // está explicando nada.
    expect(new Set(motivos).size).toBe(4);
    for (const m of motivos) {
      expect(m.trim().length).toBeGreaterThan(20);
      // "Corto y humano": una o dos frases, no un párrafo.
      expect(m.length).toBeLessThanOrEqual(160);
    }
  });
});

describe('ajustarAOpciones', () => {
  it('elige la opción más chica que NO deje afuera el radio sugerido', () => {
    expect(ajustarAOpciones(0.2, [1, 5, 20, 50])).toBe(1);
    expect(ajustarAOpciones(1, [1, 5, 20, 50])).toBe(1);
    expect(ajustarAOpciones(3, [1, 5, 20, 50])).toBe(5);
    expect(ajustarAOpciones(21, [1, 5, 20, 50])).toBe(50);
  });

  it('si el sugerido supera todas las opciones, se queda con la más grande', () => {
    expect(ajustarAOpciones(500, [1, 5, 20, 50])).toBe(50);
  });

  it('no depende del orden en que vengan las opciones', () => {
    expect(ajustarAOpciones(3, [50, 1, 20, 5])).toBe(5);
  });
});

describe('radioExplorarSugeridoKm', () => {
  it('sin filtro de especie no toca nada: se queda en el máximo de siempre', () => {
    expect(radioExplorarSugeridoKm(null)).toBe(RADIO_EXPLORAR_MAX_KM);
  });

  it('con "gato" achica el radio por defecto; con "perro" NO lo cambia', () => {
    // Lo que hoy trae la pantalla para todos. Achicárselo al perro sería
    // romper una búsqueda que anda: un perro se va kilómetros.
    expect(radioExplorarSugeridoKm('perro')).toBe(RADIO_EXPLORAR_MAX_KM);
    expect(radioExplorarSugeridoKm('otro')).toBe(RADIO_EXPLORAR_MAX_KM);
    expect(radioExplorarSugeridoKm('gato')).toBeLessThan(RADIO_EXPLORAR_MAX_KM);
  });

  it('siempre devuelve una de las opciones que la pantalla ofrece', () => {
    for (const especie of ['perro', 'gato', 'otro', null] as const) {
      expect(OPCIONES_RADIO_EXPLORAR).toContain(radioExplorarSugeridoKm(especie));
    }
  });

  it('nunca sugiere menos que el radio del animal: el margen es hacia arriba', () => {
    // Quien mira Explorar no es el animal: se mueve más que él. El margen
    // existe para que un radio calibrado no deje la lista vacía.
    expect(MARGEN_VECINDAD).toBeGreaterThan(1);
    for (const especie of ['perro', 'gato', 'otro'] as const) {
      expect(radioExplorarSugeridoKm(especie)).toBeGreaterThanOrEqual(
        radioSugerido({ especie, dias: 0 }).km,
      );
    }
  });
});

describe('radioLabel', () => {
  it('por debajo del kilómetro habla en metros: "200 m" y no "0,2 km"', () => {
    // Nadie busca a su gato en "0,2 km". Busca en doscientos metros.
    expect(radioLabel(0.2)).toBe('200 m');
    expect(radioLabel(0.95)).toBe('950 m');
  });

  it('desde el kilómetro habla en kilómetros, con coma decimal', () => {
    expect(radioLabel(1)).toBe('1 km');
    expect(radioLabel(2.5)).toBe('2,5 km');
    expect(radioLabel(25)).toBe('25 km');
  });

  it('todos los radios de la tabla se pueden escribir', () => {
    for (const especie of ['perro', 'gato', 'otro'] as const) {
      for (const ambito of ['interior', 'exterior', undefined] as const) {
        for (const dias of [0, 3, 10, 90]) {
          const texto = radioLabel(radioSugerido({ especie, ambito, dias }).km);
          expect(texto).toMatch(/^\d+(,\d)? (m|km)$/);
        }
      }
    }
  });
});

describe('preguntarAmbito', () => {
  it('se pregunta solo en gatos perdidos: es donde el dato cambia todo', () => {
    expect(preguntarAmbito({ especie: 'gato', estado: 'perdida' })).toBe(true);
  });

  it('no se pregunta cuando no aporta', () => {
    expect(preguntarAmbito({ especie: 'perro', estado: 'perdida' })).toBe(false);
    expect(preguntarAmbito({ especie: 'otro', estado: 'perdida' })).toBe(false);
    // En "encontrada" el ámbito del animal es un dato que quien lo encontró no
    // tiene. Preguntarlo sería inventar una respuesta.
    expect(preguntarAmbito({ especie: 'gato', estado: 'encontrada' })).toBe(false);
  });
});

describe('esAmbito', () => {
  it('acepta los ámbitos conocidos y rechaza cualquier otra cosa', () => {
    for (const a of AMBITOS) expect(esAmbito(a.key)).toBe(true);
    for (const basura of [null, undefined, '', 'INTERIOR', 'patio', 0, {}]) {
      expect(esAmbito(basura)).toBe(false);
    }
  });

  it('cada ámbito trae una etiqueta usable en un chip', () => {
    expect(AMBITOS).toHaveLength(2);
    for (const a of AMBITOS) {
      expect(a.label.trim().length).toBeGreaterThan(0);
      expect(a.label.length).toBeLessThanOrEqual(30);
    }
  });
});
