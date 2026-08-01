import { readFileSync } from 'fs';
import { join } from 'path';
import { ETIQUETA_RECOMPENSA, RECOMPENSA_SI, tieneRecompensa } from '../../src/lib/recompensa';
import { armarAfiche } from '../../src/lib/afiche';
import { buildShareText } from '../../src/lib/share';
import type { Pet } from '../../src/services/pets';

// EL MONTO DE LA RECOMPENSA NO SE PUBLICA.
//
// PetFBI lo dice sin vueltas: publicar la cifra atrae estafadores, incentiva a
// perseguir al animal (que es peligroso para el animal) y habilita la extorsión
// "tengo a tu perro, transferime". Lost Dogs of America directamente desaconseja
// ofrecer recompensa. Nosotros nos quedamos en el medio: se puede señalar que HAY
// recompensa, nunca cuánto.
//
// Los reportes viejos ya tienen la cifra guardada en la columna `recompensa`. No
// se borra nada (no hay migración destructiva): lo que cambia es la VISTA. Por eso
// los tests de abajo le meten un monto viejo y verifican que no salga por ningún
// lado.

function pet(over: Partial<Pet> = {}): Pet {
  return {
    id: 'p1',
    user_id: 'u1',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: 'Rocco',
    descripcion: 'Café con manchas',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  } as Pet;
}

const MONTO_VIEJO = '$50.000 en efectivo';

describe('tieneRecompensa', () => {
  it('es true solo si hay algo escrito', () => {
    expect(tieneRecompensa(MONTO_VIEJO)).toBe(true);
    expect(tieneRecompensa(RECOMPENSA_SI)).toBe(true);
    expect(tieneRecompensa('')).toBe(false);
    expect(tieneRecompensa('   ')).toBe(false);
    expect(tieneRecompensa(null)).toBe(false);
    expect(tieneRecompensa(undefined)).toBe(false);
  });
});

describe('la etiqueta que se muestra no lleva número', () => {
  it('ETIQUETA_RECOMPENSA no tiene dígitos ni signos de plata', () => {
    expect(ETIQUETA_RECOMPENSA).not.toMatch(/[0-9$€]/);
    expect(ETIQUETA_RECOMPENSA.trim().length).toBeGreaterThan(3);
  });

  it('el valor que guarda el interruptor tampoco es una cifra', () => {
    expect(RECOMPENSA_SI).not.toMatch(/[0-9$€]/);
    // Tiene que pasar el filtro "hay recompensa" del servidor
    // (`coalesce(trim(p.recompensa), '') <> ''`, migración 0028).
    expect(RECOMPENSA_SI.trim().length).toBeGreaterThan(0);
  });
});

describe('el texto para compartir no lleva el monto', () => {
  it('un reporte viejo con cifra se comparte sin la cifra', () => {
    const texto = buildShareText(pet({ recompensa: MONTO_VIEJO }));
    expect(texto).not.toContain('50.000');
    expect(texto).not.toContain('$');
    expect(texto).not.toContain('efectivo');
    // Pero sí avisa que hay recompensa.
    expect(texto).toContain(ETIQUETA_RECOMPENSA);
  });

  it('sin recompensa no dice nada de recompensa', () => {
    const texto = buildShareText(pet({ recompensa: null }));
    expect(texto.toLowerCase()).not.toContain('recompensa');
  });
});

describe('el afiche impreso no lleva el monto', () => {
  it('el contenido del afiche no guarda la cifra en ningún campo', () => {
    const c = armarAfiche(pet({ recompensa: MONTO_VIEJO }), null);
    expect(c.hayRecompensa).toBe(true);
    // Barrido completo: la cifra no puede quedar escondida en NINGUNA propiedad
    // del objeto que después dibuja el póster.
    expect(JSON.stringify(c)).not.toContain('50.000');
    expect(JSON.stringify(c)).not.toContain('efectivo');
  });

  it('sin recompensa, el afiche no la anuncia', () => {
    expect(armarAfiche(pet({ recompensa: '' }), null).hayRecompensa).toBe(false);
    expect(armarAfiche(pet({ recompensa: null }), null).hayRecompensa).toBe(false);
  });
});

// GUARDIÁN ESTÁTICO. Los tests de arriba cubren las dos funciones puras; las
// vistas son JSX y se pueden romper con un `{pet.recompensa}` de una línea. Acá
// se lee el código: en las vistas públicas, la columna `recompensa` SOLO puede
// tocarse a través de `tieneRecompensa(...)`, nunca imprimirse.
const VISTAS_PUBLICAS = [
  'src/screens/PetDetailScreen.tsx',
  'src/screens/PublicPetScreen.tsx',
  'src/components/PetCard.tsx',
  'src/components/AfichePoster.tsx',
  'src/lib/share.ts',
  'src/lib/afiche.ts',
];

function leer(rel: string): string {
  return readFileSync(join(__dirname, '..', '..', ...rel.split('/')), 'utf8');
}

describe('GUARDIÁN — ninguna vista pública imprime el valor de `recompensa`', () => {
  it.each(VISTAS_PUBLICAS)('%s solo lee recompensa a través de tieneRecompensa()', (rel) => {
    // Los comentarios se descartan: explicar por qué NO se imprime
    // `{content.recompensa}` no puede hacer fallar justo al test que comprueba
    // que no se imprime.
    const fuente = leer(rel)
      .split('\n')
      // Sin `$` a propósito: los archivos del repo vienen con CRLF y `.` no cruza
      // el `\r`, así que un `//.*$` no llegaba nunca al final de la línea.
      .map((l) => l.replace(/\/\/.*/, ''))
      .join('\n');
    // Se borran los usos permitidos: `tieneRecompensa(loQueSea.recompensa)`.
    const sinUsosLegitimos = fuente.replace(/tieneRecompensa\([^)]*\)/g, '');
    // Lo que quede que acceda a `.recompensa` es un acceso al valor crudo.
    const accesosCrudos = sinUsosLegitimos.match(/\.recompensa\b/g) ?? [];
    expect(accesosCrudos).toEqual([]);
  });

  it('el póster del afiche dibuja la etiqueta, no un campo de texto libre', () => {
    const fuente = leer('src/components/AfichePoster.tsx');
    expect(fuente).toContain('ETIQUETA_RECOMPENSA');
    expect(fuente).toContain('hayRecompensa');
  });
});

describe('GUARDIÁN — los formularios ya no piden una cifra', () => {
  it.each(['src/screens/PublishScreen.tsx', 'src/screens/EditPetScreen.tsx'])(
    '%s no tiene un campo de texto libre de recompensa',
    (rel) => {
      const fuente = leer(rel);
      // El viejo `<Input placeholder="Recompensa (opcional)" ...>` invitaba a
      // escribir "$50.000" y después no lo mostrábamos: una promesa rota, y una
      // cifra guardada al pedo. Ahora es un interruptor.
      expect(fuente).not.toMatch(/placeholder=["'][^"']*[Rr]ecompensa/);
      expect(fuente).toContain('RECOMPENSA_SI');
    },
  );
});
