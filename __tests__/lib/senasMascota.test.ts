import {
  CHIP_BASURA_SQL,
  CHIP_LARGO_MAX,
  CHIP_LARGO_MIN,
  COLORES,
  COLOR_ETIQUETA,
  ESTERILIZADO_ETIQUETA,
  MAX_COLORES,
  SEXO_ETIQUETA,
  TAMANOS_INCOMPATIBLES,
  TAMANO_ETIQUETA,
  chipPrecargable,
  coloresSeContradicen,
  normalizarChip,
  normalizarColores,
  tamanosSeContradicen,
  validarChip,
} from '../../src/lib/senasMascota';

// SEÑAS ESTRUCTURADAS (migración 0054) — la mitad pura.
//
// Hasta acá lo único que identificaba a un animal era el textarea `descripcion`,
// y el motor de coincidencias cruzaba estado opuesto + especie + 15 km. Estas
// funciones son el vocabulario compartido: las mismas reglas las aplica el
// cliente (para pintar los chips y validar) y el SQL de la 0054 (para descartar
// y puntuar). Que las dos mitades hablen el mismo idioma es lo que este archivo
// ata; el cruce contra el SQL de verdad vive en __tests__/db/migracion0054.test.ts.

describe('vocabulario', () => {
  it('cada color tiene etiqueta y ninguna etiqueta sobra', () => {
    // Un color sin etiqueta se dibujaría como `undefined` en un chip.
    expect(Object.keys(COLOR_ETIQUETA).sort()).toEqual([...COLORES].sort());
  });

  it('los valores son los que ya usa `adoptions` (0030), no un vocabulario nuevo', () => {
    // La mitad "adopción" de la app ya modeló tamaño y esterilizado. Inventar
    // otros valores acá haría que las dos mitades no se puedan cruzar nunca.
    expect(Object.keys(TAMANO_ETIQUETA).sort()).toEqual(['chico', 'grande', 'mediano']);
    expect(Object.keys(ESTERILIZADO_ETIQUETA).sort()).toEqual(['no', 'no_se', 'si']);
    // `sexo` no existía en adopciones: se sigue la MISMA convención de tri-estado
    // con 'no_se' explícito, en vez de un booleano que no sabe decir "no sé".
    expect(Object.keys(SEXO_ETIQUETA).sort()).toEqual(['hembra', 'macho', 'no_se']);
  });
});

describe('normalizarColores', () => {
  it('descarta lo que no es un color del vocabulario', () => {
    expect(normalizarColores(['negro', 'fucsia', 'blanco'])).toEqual(['negro', 'blanco']);
  });

  it('deduplica sin cambiar el orden en que los eligieron', () => {
    expect(normalizarColores(['blanco', 'negro', 'blanco'])).toEqual(['blanco', 'negro']);
  });

  it('corta en MAX_COLORES: una lista de siete colores no describe a nadie', () => {
    expect(normalizarColores([...COLORES])).toHaveLength(MAX_COLORES);
  });

  it('cualquier cosa que no sea una lista da lista vacía', () => {
    for (const basura of [null, undefined, 'negro', 42, {}]) {
      expect(normalizarColores(basura)).toEqual([]);
    }
  });
});

describe('coloresSeContradicen — lo que FALTA nunca descarta', () => {
  it('dos listas sin ningún color en común se contradicen', () => {
    expect(coloresSeContradicen(['negro'], ['blanco'])).toBe(true);
  });

  it('con un solo color en común NO se contradicen (un animal tiene varios)', () => {
    // Un perro blanco y negro: el dueño marcó los dos, el que lo encontró marcó
    // uno. Si esto descartara, perderíamos la coincidencia buena.
    expect(coloresSeContradicen(['negro', 'blanco'], ['blanco'])).toBe(false);
  });

  it('si a alguno de los dos lados le falta el dato, NO descarta', () => {
    // La mayoría de los reportes viejos no tienen ninguno de estos campos. Un
    // motor que exija los datos nuevos se queda sin coincidencias para todos.
    expect(coloresSeContradicen([], ['blanco'])).toBe(false);
    expect(coloresSeContradicen(['negro'], [])).toBe(false);
    expect(coloresSeContradicen(null, null)).toBe(false);
    expect(coloresSeContradicen(undefined, ['negro'])).toBe(false);
  });
});

describe('tamanosSeContradicen — solo los extremos', () => {
  it('chico contra grande se contradice, en los dos sentidos', () => {
    expect(tamanosSeContradicen('chico', 'grande')).toBe(true);
    expect(tamanosSeContradicen('grande', 'chico')).toBe(true);
  });

  it('chico contra mediano NO se contradice: ahí la gente no se pone de acuerdo', () => {
    // Un mestizo de 12 kg es "mediano" para uno y "chico" para otro. Descartar
    // por eso sería tirar coincidencias buenas por una diferencia de criterio.
    expect(tamanosSeContradicen('chico', 'mediano')).toBe(false);
    expect(tamanosSeContradicen('mediano', 'grande')).toBe(false);
  });

  it('igual no se contradice y lo que falta tampoco', () => {
    expect(tamanosSeContradicen('grande', 'grande')).toBe(false);
    expect(tamanosSeContradicen(null, 'grande')).toBe(false);
    expect(tamanosSeContradicen('chico', undefined)).toBe(false);
  });

  it('la tabla de pares incompatibles es la lista real, no adorno', () => {
    // El SQL de la 0054 tiene que descartar EXACTAMENTE estos pares; el cruce
    // lo hace migracion0054.test.ts contra esta misma constante.
    for (const [a, b] of TAMANOS_INCOMPATIBLES) {
      expect(tamanosSeContradicen(a, b)).toBe(true);
    }
    expect(TAMANOS_INCOMPATIBLES).toEqual([['chico', 'grande']]);
  });
});

describe('normalizarChip', () => {
  it('saca separadores y espacios, y sube a mayúsculas', () => {
    // La gente lo copia del carnet del veterinario con puntos y espacios.
    expect(normalizarChip(' 985-112 003 456 789 ')).toBe('985112003456789');
    expect(normalizarChip('abc123def45')).toBe('ABC123DEF45');
  });

  it('vacío o basura da null (no cadena vacía: una fila con "" mentiría)', () => {
    expect(normalizarChip('')).toBeNull();
    expect(normalizarChip('   ')).toBeNull();
    expect(normalizarChip('-- --')).toBeNull();
    expect(normalizarChip(null)).toBeNull();
    expect(normalizarChip(undefined)).toBeNull();
  });
});

describe('validarChip', () => {
  it('acepta el ISO de 15 dígitos, que es el que se usa en Chile', () => {
    expect(validarChip('985112003456789').ok).toBe(true);
  });

  it('acepta los viejos de 9 y 10 caracteres (AVID y similares)', () => {
    expect(validarChip('123456789').ok).toBe(true);
    expect(validarChip('1A2B3C4D5E').ok).toBe(true);
  });

  it('vacío es válido: el chip es OPCIONAL', () => {
    expect(validarChip('').ok).toBe(true);
    expect(validarChip(null).ok).toBe(true);
  });

  it('rechaza lo demasiado corto y lo demasiado largo, con motivo', () => {
    const corto = validarChip('1'.repeat(CHIP_LARGO_MIN - 1));
    expect(corto.ok).toBe(false);
    expect(corto.ok === false && corto.motivo.length).toBeGreaterThan(10);
    expect(validarChip('1'.repeat(CHIP_LARGO_MAX + 1)).ok).toBe(false);
  });

  it('valida sobre el número NORMALIZADO, no sobre lo tipeado', () => {
    // Con guiones y espacios son 19 caracteres; el chip son 15. Si validáramos
    // el texto crudo, un número perfectamente válido quedaría rechazado.
    expect(validarChip('985-112-003-456-789').ok).toBe(true);
  });
});

describe('chipPrecargable — lo que se copia de la ficha "Mi mascota"', () => {
  it('devuelve el número NORMALIZADO, no lo que estaba escrito en la ficha', () => {
    // La ficha guarda lo que la persona tipeó (con guiones, con espacios). El
    // formulario del reporte tiene que quedar con la forma que se guarda y se
    // cruza, o el dueño ve un número distinto del que la app va a comparar.
    expect(chipPrecargable('985-112 003.456.789')).toBe('985112003456789');
    expect(chipPrecargable('1a2b3c4d5e')).toBe('1A2B3C4D5E');
  });

  it('descarta lo que NO es un chip, aunque la ficha lo tenga guardado', () => {
    // `my_pets.chip` nunca pasó por `validarChip`: su único control es el CHECK
    // de 40 caracteres de la 0027. Si esto copiara el texto crudo, al apretar
    // Publicar `validarChip` lo rebotaría y el reporte de una mascota perdida
    // quedaría trabado por algo que la persona ni escribió en ese formulario.
    expect(chipPrecargable('no sé')).toBeNull();
    expect(chipPrecargable('lo tiene el veterinario')).toBeNull();
    expect(chipPrecargable('98511')).toBeNull(); // el número a medias
  });

  it('vacío y nulo no pre-cargan nada', () => {
    expect(chipPrecargable('')).toBeNull();
    expect(chipPrecargable('   ')).toBeNull();
    expect(chipPrecargable(null)).toBeNull();
    expect(chipPrecargable(undefined)).toBeNull();
  });

  it('lo que acepta es exactamente lo que acepta validarChip', () => {
    // Anti-divergencia: si mañana el rango de largos cambia en un lado y no en
    // el otro, la pre-carga volvería a copiar chips que después traban Publicar.
    for (const caso of ['985112003456789', '123456789', '1A2B3C4D5E', '12', '1'.repeat(16), 'no sé']) {
      expect(chipPrecargable(caso) !== null).toBe(
        validarChip(caso).ok && normalizarChip(caso) !== null,
      );
    }
  });
});

describe('la limpieza del chip es UNA sola regla', () => {
  it('la clase de caracteres es la misma que va a usar el SQL', () => {
    // `pet_chips.chip_norm` es una columna generada con esta misma expresión.
    // Si las dos limpiezas se separan, "985 112" guardado por la app y
    // "985112" tecleado por otra persona dejan de cruzarse y el chip —el dato
    // más fuerte que tenemos— no encuentra nada. El cruce contra el archivo SQL
    // está en migracion0054.test.ts; acá se fija que la constante SE USE.
    expect(CHIP_BASURA_SQL).toBe('[^A-Za-z0-9]');
    const conBasura = '98/5*11 2';
    expect(normalizarChip(conBasura)).toBe(conBasura.replace(new RegExp(CHIP_BASURA_SQL, 'g'), '').toUpperCase());
  });
});
