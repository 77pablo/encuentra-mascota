import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { DOMINIOS_CAIDOS, dominioDe } from '../../src/data/registrosChip';

// GUARDRAIL DE ENLACES MUERTOS.
//
// Los seis "registros de microchip" que circulan en las guías de internet
// chilenas NO están todos vivos. Verificado a mano el 1-ago-2026:
//
//   · microtag.cl              → el dominio no existe (NXDOMAIN).
//   · registroanimalchile.cl   → tomado por SEO de casinos online; su buscador
//                                de chip (`/infochip/?c=…`) devuelve hoy una
//                                página titulada "Mejores Casinos Online 2026".
//   · registrocivildemascotas.cl → dominio estacionado y EN VENTA.
//   · zoodata.cl               → resuelve por DNS pero no contesta (7 intentos).
//   · chipmascotas.cl          → redirige a una tienda de bicicletas.
//
// Mandar a alguien que tiene un perro perdido al lado a una página de casinos
// es peor que no darle ningún enlace. Este test LEE EL CÓDIGO DE VERDAD: si
// alguien vuelve a pegar uno de esos dominios en cualquier archivo de `src/`
// (una guía, un texto legal, una pantalla nueva), se pone rojo solo.

const SRC = join(__dirname, '..', '..', 'src');

function archivosDeFuente(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...archivosDeFuente(ruta));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) out.push(ruta);
  }
  return out.sort();
}

/** Toda URL http(s) que aparezca en el texto del archivo. */
function urlsDe(src: string): string[] {
  return src.match(/https?:\/\/[^\s'"`)\]]+/g) ?? [];
}

const archivos = archivosDeFuente(SRC);

describe('el escáner mira archivos y encuentra URLs de verdad', () => {
  it('hay archivos de fuente para revisar', () => {
    expect(archivos.length).toBeGreaterThan(30);
  });

  it('encuentra URLs en el código (si no, el guardrail pasaría por vacío)', () => {
    const todas = archivos.flatMap((a) => urlsDe(readFileSync(a, 'utf8')));
    expect(todas.length).toBeGreaterThan(3);
    expect(todas.some((u) => dominioDe(u) === 'registratumascota.cl')).toBe(true);
  });

  it('la lista de dominios muertos no está vacía', () => {
    expect(DOMINIOS_CAIDOS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('ningún archivo de src/ enlaza a un registro de chip muerto', () => {
  it('no hay ni una URL a un dominio caído', () => {
    const malos: string[] = [];
    for (const archivo of archivos) {
      for (const url of urlsDe(readFileSync(archivo, 'utf8'))) {
        if (DOMINIOS_CAIDOS.includes(dominioDe(url))) {
          malos.push(`${relative(SRC, archivo)}: ${url}`);
        }
      }
    }
    expect(malos).toEqual([]);
  });
});

describe('el Registro Nacional se enlaza por https y a una página interna', () => {
  // `https://registratumascota.cl/` (la raíz) responde 302 hacia
  // `http://registratumascota.cl/inicio.xhtml` — degrada a HTTP en el camino.
  // Las páginas internas sí se sirven por https, así que se enlazan directo.
  it('no queda ningún enlace a la raíz pelada ni ninguno por http', () => {
    const malos: string[] = [];
    for (const archivo of archivos) {
      for (const url of urlsDe(readFileSync(archivo, 'utf8'))) {
        if (dominioDe(url) !== 'registratumascota.cl') continue;
        if (url.startsWith('http://') || /^https:\/\/registratumascota\.cl\/?$/.test(url)) {
          malos.push(`${relative(SRC, archivo)}: ${url}`);
        }
      }
    }
    expect(malos).toEqual([]);
  });
});
