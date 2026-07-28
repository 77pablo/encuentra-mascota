import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Ninguna prop de accesibilidad puede caerse en silencio en la web.
//
// react-native-web mantiene una lista blanca de props que reenvía al DOM
// (`modules/forwardedProps`). Lo que no está ahí NO se traduce: no hay error,
// no hay warning, y `tsc` lo acepta porque el tipo de React Native —que es
// nativo— sigue existiendo. Así se nos pasaron dos:
//
//   · `accessibilityState`: 5 casillas quedaban con `role="checkbox"` y sin
//     `aria-checked`, incluida la de aceptación de términos que exige Google
//     Play. Un lector de pantalla decía "casilla" sin poder decir si estaba
//     marcada.
//   · `accessibilityHint`: no aparece en NINGÚN archivo de la librería. La
//     instrucción "mantené apretado para denunciar este mensaje" no le llegaba
//     a nadie en la web.
//
// Este test no repite una lista escrita a mano —que envejecería igual que el
// bug— sino que LEE la tabla de la versión de react-native-web instalada. Si
// mañana se actualiza y deja de soportar otra prop, o si alguien escribe una
// que nunca existió, el test lo dice.

const RAIZ = join(__dirname, '..', '..');
const TABLA = join(
  RAIZ,
  'node_modules',
  'react-native-web',
  'dist',
  'modules',
  'forwardedProps',
  'index.js',
);

/** Las props que la versión instalada de react-native-web sí reenvía. */
function propsSoportadas(): Set<string> {
  let codigo: string;
  try {
    codigo = readFileSync(TABLA, 'utf8');
  } catch {
    // Fallar ruidosamente y no "pasar por defecto": un test de guardia que se
    // apaga solo cuando no encuentra su fuente es peor que no tenerlo.
    throw new Error(
      `No se pudo leer la tabla de props de react-native-web en ${TABLA}. ` +
        'Si la librería cambió de estructura, hay que actualizar este test — no borrarlo.',
    );
  }
  const claves = codigo.match(/^\s{2}'?([A-Za-z][\w-]*)'?:\s*true,?$/gm) ?? [];
  const soportadas = new Set(
    claves.map((l) => l.trim().replace(/:\s*true,?$/, '').replace(/'/g, '')),
  );
  if (soportadas.size < 50) {
    throw new Error(
      `Solo se extrajeron ${soportadas.size} props de la tabla: el formato del archivo cambió ` +
        'y la expresión de arriba dejó de servir. Arreglarla, no bajar el número.',
    );
  }
  return soportadas;
}

function archivosFuente(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosFuente(ruta));
    else if (entrada.endsWith('.tsx') || entrada.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

const soportadas = propsSoportadas();

// Props que react-native-web NO reenvía y que aun así se usan a propósito,
// porque la app también corre NATIVA (iOS/Android), donde VoiceOver y TalkBack
// sí las leen. Cada una vale solo si viaja junto a su equivalente `aria-*`, y
// eso lo tiene que garantizar otro test — que se nombra acá y se comprueba que
// exista, para que borrarlo no deje esta excepción suelta.
const EXCEPCIONES: Record<string, { porque: string; atadaPor: string }> = {
  accessibilityState: {
    porque: 'la leen VoiceOver/TalkBack en la app nativa; en web va con aria-checked',
    atadaPor: '__tests__/lib/casillasAccesibles.test.ts',
  },
};

// Props `accessibilityX` que el código realmente usa, con dónde aparecen.
const usadas = new Map<string, string[]>();
for (const ruta of archivosFuente(join(RAIZ, 'src'))) {
  const codigo = readFileSync(ruta, 'utf8');
  for (const m of codigo.matchAll(/\b(accessibility[A-Z]\w*)\s*=\s*[{"']/g)) {
    const prop = m[1];
    const donde = ruta.slice(ruta.indexOf('src'));
    const previos = usadas.get(prop);
    if (previos) {
      if (!previos.includes(donde)) previos.push(donde);
    } else {
      usadas.set(prop, [donde]);
    }
  }
}

describe('ninguna prop de accesibilidad se cae en silencio en la web', () => {
  it('la tabla de react-native-web se pudo leer', () => {
    // Sin esto, un fallo al leer el archivo dejaría los tests de abajo sin nada
    // que comparar y en verde.
    expect(soportadas.has('aria-checked')).toBe(true);
    expect(soportadas.has('accessibilityLabel')).toBe(true);
  });

  it('hay props que revisar (si esto falla, el buscador quedó ciego)', () => {
    expect(usadas.size).toBeGreaterThan(0);
  });

  it.each([...usadas.entries()])(
    '%s llega al DOM (o tiene su excepción justificada)',
    (prop, donde) => {
      // Si esto se pone rojo: la prop existe en React Native pero NO llega al
      // DOM. Hay que reemplazarla por su equivalente `aria-*` —o agregarlo
      // además y anotarla en EXCEPCIONES, si también hace falta en nativo.
      const veredicto = soportadas.has(prop) || EXCEPCIONES[prop] ? 'ok' : 'NO SE REENVÍA';
      expect(`${prop} (${donde.join(', ')}): ${veredicto}`).toBe(
        `${prop} (${donde.join(', ')}): ok`,
      );
    },
  );

  it.each(Object.entries(EXCEPCIONES))(
    'la excepción de %s sigue respaldada por su test',
    (_prop, { atadaPor }) => {
      // Una excepción cuyo garante desapareció es un agujero con permiso.
      expect(() => readFileSync(join(RAIZ, atadaPor), 'utf8')).not.toThrow();
    },
  );

  it('accessibilityHint no vuelve a aparecer', () => {
    // Caso concreto ya corregido: no está en la tabla NI en el código de la
    // librería. Se deja explícito porque es fácil de reintroducir (existe en
    // React Native y el editor lo autocompleta).
    expect(soportadas.has('accessibilityHint')).toBe(false);
    expect(usadas.has('accessibilityHint')).toBe(false);
  });
});
