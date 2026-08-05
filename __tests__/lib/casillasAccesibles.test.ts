import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Toda casilla tiene que declarar su estado EN LAS DOS APIs.
//
// El bug que motiva este test no se ve leyendo el código: `accessibilityState`
// es la API correcta en React Native, pero react-native-web dejó de traducirla
// en la 0.19 (acá corre 0.21) y lo hace EN SILENCIO — sin error, sin warning, y
// `tsc` la acepta porque el tipo de RN sigue existiendo. El resultado en el DOM
// era `role="checkbox"` sin `aria-checked`: un lector de pantalla anuncia
// "casilla" y no puede decir si está marcada. Verificado en producción el
// 28-jul sobre la casilla de aceptación de términos, que es justo la que Google
// Play exige.
//
// Trampa para el que venga: `accessibilityLabel` SÍ se sigue traduciendo a
// `aria-label`, así que ver el aria-label en el DOM NO prueba que el estado
// también haya llegado. Por eso esto se ata acá y no a ojo.
//
// Al revés también importa: `aria-checked` solo no alcanza, porque en la app
// nativa (iOS/Android) VoiceOver y TalkBack leen `accessibilityState`.

const RAIZ = join(__dirname, '..', '..', 'src');

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (entrada.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}

/** Cada bloque de props de un elemento con role="checkbox". */
function casillasDe(codigo: string): string[] {
  const bloques: string[] = [];
  const re = /accessibilityRole="checkbox"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    // La ventana alrededor cubre el bloque de props del mismo elemento: se
    // corta en el `>` que cierra la etiqueta de apertura.
    const desde = codigo.lastIndexOf('<', m.index);
    const hasta = codigo.indexOf('>', m.index);
    bloques.push(codigo.slice(desde, hasta === -1 ? m.index + 400 : hasta));
  }
  return bloques;
}

const archivos = archivosTsx(RAIZ);
const casillas = archivos.flatMap((ruta) =>
  casillasDe(readFileSync(ruta, 'utf8')).map((bloque, i) => ({
    donde: `${ruta.slice(ruta.indexOf('src'))} (casilla ${i + 1})`,
    bloque,
  })),
);

describe('las casillas declaran su estado en las dos APIs', () => {
  it('hay casillas que revisar (si esto falla, el buscador quedó ciego)', () => {
    // Sin esta guarda, borrar o renombrar las casillas dejaría los tests de
    // abajo en verde por vacuidad.
    expect(casillas.length).toBeGreaterThanOrEqual(5);
  });

  it.each(casillas.map((c) => [c.donde, c.bloque]))(
    '%s declara aria-checked (web) y accessibilityState (nativo)',
    (_donde, bloque) => {
      expect(bloque).toMatch(/aria-checked=\{/);
      expect(bloque).toMatch(/accessibilityState=\{\{\s*checked:/);
    },
  );

  it('las dos props miran la MISMA variable', () => {
    // Un copy-paste que deje `aria-checked={otraCosa}` daría un lector de
    // pantalla que miente, que es peor que uno que no dice nada.
    for (const { donde, bloque } of casillas) {
      const aria = /aria-checked=\{([^}]+)\}/.exec(bloque)?.[1]?.trim();
      const estado = /accessibilityState=\{\{\s*checked:\s*([^}]+)\}\}/
        .exec(bloque)?.[1]
        ?.trim();
      expect(`${donde}: ${aria}`).toBe(`${donde}: ${estado}`);
    }
  });
});

// LOS GRUPOS DE "ELEGÍ UNO" NO SON CASILLAS.
//
// El barrido de arriba solo mira `accessibilityRole="checkbox"` literal, así
// que nunca vio este agujero: los Chip de un grupo de "elegí uno" (tamaño,
// sexo, especie, radio de búsqueda…) se llamaban sin `rol="opcion"`, y por
// default `Chip` cae en 'casilla' en cuanto recibe `active`. El resultado es
// un lector de pantalla que anuncia "casilla, Chico" en vez de "radio, Chico,
// 1 de 3": promete que se puede marcar Chico Y Grande a la vez, que es
// justo lo que el grupo prohíbe. Deuda arrastrada desde la tanda 12.
const PANTALLAS_CON_GRUPOS = [
  'screens/AdopcionFeedScreen.tsx', 'screens/AlertZoneScreen.tsx', 'screens/EncontreScreen.tsx',
  'screens/EditAdoptionScreen.tsx', 'screens/PublicarAdopcionScreen.tsx',
  'screens/ProfileScreen.tsx', 'screens/HomeScreen.tsx',
  'components/SelectorAmbito.tsx', 'components/PlanBusqueda.tsx',
];

it.each(PANTALLAS_CON_GRUPOS)('%s anuncia sus grupos de elegí-uno como radio', (rel) => {
  const fuente = readFileSync(join(__dirname, '..', '..', 'src', rel), 'utf8');
  expect(fuente).toMatch(/accessibilityRole="radiogroup"/);
});
