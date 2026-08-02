import { readFileSync } from 'fs';
import { join } from 'path';
import { GUIA_ENCONTRADA, RUTAS_GUIA_ENCONTRADA } from '../../src/data/guiaEncontrada';
import { resolverNavegacionGuia } from '../../src/lib/guiaNavegacion';

// La pantalla del microchip no sirve de nada si no se llega a ella. Los tres
// lugares donde alguien la necesita son:
//   · la guía "encontré una mascota" (el paso "revisá si tiene chip"),
//   · Ayuda y recursos (el atajo de "necesito actuar YA"),
//   · la ficha pública de un reporte (a la que se llega por el QR del afiche o
//     por un link de WhatsApp, con el animal al lado).
// Y un cuarto, para el empujón a inscribir: "Mis mascotas".
//
// Este archivo LEE LOS ARCHIVOS DE VERDAD. No hay lista blanca: si alguien
// borra la entrada de una pantalla, o le cambia el nombre a la ruta en el
// navigator y no en la pantalla, se pone rojo.

const SRC = join(__dirname, '..', '..', 'src');
const leer = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const rootSrc = leer('navigation', 'RootNavigator.tsx');

/** El `name="…"` de los `<Stack.Screen>` del stack raíz. */
function nombresDelRaiz(src: string): string[] {
  const out: string[] = [];
  const re = /<Stack\.Screen\b([\s\S]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const nombre = /name="([^"]+)"/.exec(m[1])?.[1];
    if (nombre) out.push(nombre);
  }
  return out;
}

const RUTA = 'Microchip';

describe('el parser lee el navigator de verdad', () => {
  it('encuentra las pantallas del stack raíz', () => {
    const nombres = nombresDelRaiz(rootSrc);
    expect(nombres.length).toBeGreaterThan(8);
    // Cordura: dos que ya existían antes de esta función.
    expect(nombres).toContain('Ayuda');
    expect(nombres).toContain('GuiaEncontrada');
  });
});

describe('la pantalla del microchip está registrada en el stack RAÍZ', () => {
  it(`el raíz registra "${RUTA}"`, () => {
    expect(nombresDelRaiz(rootSrc)).toContain(RUTA);
  });

  it('va al raíz y no dentro de una pestaña: se abre desde la ficha pública', () => {
    // La ficha pública (`MascotaPublica`) vive en el raíz y navega por nombre
    // pelado, que burbujea hacia los ancestros y NUNCA hacia el stack de una
    // pestaña hermana. Si esta pantalla viviera dentro de una pestaña, el
    // botón de la ficha pública no haría nada (es el bug que ya se coló siete
    // veces en este repo).
    expect(leer('navigation', 'TabNavigator.tsx')).not.toContain(`name="${RUTA}"`);
  });
});

describe('los cuatro puntos de entrada apuntan a la pantalla', () => {
  const entradas: [string, string[]][] = [
    ['Ayuda y recursos', ['screens', 'AyudaScreen.tsx']],
    ['la ficha pública de un reporte', ['screens', 'PublicPetScreen.tsx']],
    ['Mis mascotas (el empujón a inscribir)', ['screens', 'MyPetsScreen.tsx']],
  ];

  entradas.forEach(([donde, ruta]) => {
    it(`${donde} navega a ${RUTA}`, () => {
      expect(leer(...ruta)).toContain(`navigate('${RUTA}')`);
    });
  });

  it('la guía "encontré una mascota" manda al paso del chip', () => {
    const paso = GUIA_ENCONTRADA.find((p) => p.id === 'revisa-el-chip');
    expect(paso?.accion?.ruta).toBe(RUTA);
    expect(paso?.accion?.url).toBeUndefined();
  });

  it(`"${RUTA}" está en la lista de rutas permitidas de la guía`, () => {
    expect(RUTAS_GUIA_ENCONTRADA).toContain(RUTA);
  });

  it('la guía la resuelve como hermana del raíz (nombre pelado, sin anidar)', () => {
    // `Publicar`/`Explorar` son pestañas y necesitan la forma anidada; una
    // pantalla del raíz NO, y anidarla la rompería.
    expect(resolverNavegacionGuia(RUTA)).toEqual({ name: RUTA, params: undefined });
  });
});
