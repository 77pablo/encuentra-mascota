import { readFileSync } from 'fs';
import { join } from 'path';

// DOS ENTRADAS DEL PERFIL QUE SE LLAMAN CASI IGUAL.
//
// En el Perfil conviven dos filas distintas y vecinas:
//   · "Tus avisos"            → `MisAvisos`, la BANDEJA (migracion 0051);
//   · "Preferencias de avisos" → `NotificationPrefs`, donde se elige QUE llega
//     y por que canal.
// La fila de abajo se llamo asi justamente para desambiguar… y el navigator le
// ponia `title: 'Avisos'` a esa pantalla. O sea: tocabas "Preferencias de
// avisos" y el encabezado decia "Avisos", que es el nombre del que se la quiso
// distinguir. Dos cosas distintas con el mismo nombre a veinte pixeles.
//
// Este archivo LEE LOS DOS ARCHIVOS DE VERDAD (`TabNavigator.tsx` y
// `ProfileScreen.tsx`). No hay ninguna lista escrita a mano: si mañana alguien
// agrega una pantalla al stack del perfil con un titulo que se pisa con otro, o
// renombra una fila sin renombrar su encabezado, se entera aca.
const SRC = join(__dirname, '..', '..', 'src');
const tabSrc = readFileSync(join(SRC, 'navigation', 'TabNavigator.tsx'), 'utf8').replace(/\r\n/g, '\n');
const perfilSrc = readFileSync(join(SRC, 'screens', 'ProfileScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** Minusculas y sin tildes: "Moderación" y "moderacion" son el mismo nombre. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    // Escapado y no el caracter crudo: son marcas combinantes invisibles y una
    // sola pasada de un editor con otra codificacion las convierte en basura.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Las pantallas del stack del Perfil, con el titulo de su encabezado. */
function pantallasDelPerfil(): { name: string; title: string }[] {
  const bloques = [...tabSrc.matchAll(/<ProfileStackNav\.Screen\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  expect(bloques.length).toBeGreaterThan(10);
  const out: { name: string; title: string }[] = [];
  for (const b of bloques) {
    const name = /name="([^"]+)"/.exec(b)?.[1];
    const title = /title:\s*'([^']+)'/.exec(b)?.[1];
    if (name && title) out.push({ name, title });
  }
  return out;
}

/**
 * Las filas del Perfil: a que pantalla van y con que texto estan escritas.
 * Se toman TODAS las cadenas literales del boton (no solo `title="…"`) porque
 * la fila de la bandeja arma su texto con una plantilla que le suma el contador
 * de sin leer.
 */
function filasDelPerfil(): { destino: string; etiquetas: string[] }[] {
  const bloques = [...perfilSrc.matchAll(/<Button\b([\s\S]*?)\/>/g)].map((m) => m[1]);
  const out: { destino: string; etiquetas: string[] }[] = [];
  for (const b of bloques) {
    const destino = /navigation\.navigate\('([^']+)'\)/.exec(b)?.[1];
    if (!destino) continue;
    const trozoTitulo = b.slice(b.indexOf('title'), b.indexOf('onPress'));
    const etiquetas = [
      ...[...trozoTitulo.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]),
      ...[...trozoTitulo.matchAll(/'([^']{3,})'/g)].map((m) => m[1]),
      ...[...trozoTitulo.matchAll(/`([^`$]{3,})`/g)].map((m) => m[1]),
    ];
    if (etiquetas.length > 0) out.push({ destino, etiquetas });
  }
  return out;
}

const pantallas = pantallasDelPerfil();
const filas = filasDelPerfil();

describe('los parsers leen los archivos de verdad (si no, todo pasa por vacio)', () => {
  it('encuentra las pantallas del stack del Perfil con su titulo', () => {
    expect(pantallas.length).toBeGreaterThanOrEqual(12);
    expect(pantallas.map((p) => p.name)).toEqual(
      expect.arrayContaining(['NotificationPrefs', 'MisAvisos', 'Bloqueados']),
    );
  });

  it('encuentra las filas del Perfil con su destino', () => {
    expect(filas.length).toBeGreaterThanOrEqual(8);
    const destinos = filas.map((f) => f.destino);
    expect(destinos).toEqual(expect.arrayContaining(['NotificationPrefs', 'MisAvisos']));
    // La fila de la bandeja arma el texto con plantilla: si el parser no
    // rescatara igual su etiqueta, el test de abajo no cubriria justo el par
    // que produjo el bug.
    const bandeja = filas.find((f) => f.destino === 'MisAvisos')!;
    expect(bandeja.etiquetas.map(norm)).toContain('tus avisos');
  });
});

describe('ninguna pantalla del Perfil se llama como otra', () => {
  it('los titulos son todos distintos', () => {
    const vistos = new Map<string, string>();
    const choques: string[] = [];
    for (const p of pantallas) {
      const clave = norm(p.title);
      if (vistos.has(clave)) choques.push(`${vistos.get(clave)} y ${p.name} → "${p.title}"`);
      else vistos.set(clave, p.name);
    }
    expect(choques).toEqual([]);
  });

  it('ningun titulo esta CONTENIDO en el de otra pantalla', () => {
    // ESTE es el test que importa, y el que agarra el bug: "Avisos" no era
    // igual a "Tus avisos", era peor — el nombre generico de la cosa de la que
    // hay que distinguirse. Contenido uno en el otro es exactamente eso.
    const choques: string[] = [];
    for (const a of pantallas) {
      for (const b of pantallas) {
        if (a.name === b.name) continue;
        if (norm(b.title).includes(norm(a.title))) {
          choques.push(`${a.name} ("${a.title}") se pierde adentro de ${b.name} ("${b.title}")`);
        }
      }
    }
    expect(choques).toEqual([]);
  });
});

describe('lo que tocas y lo que ves arriba se llaman igual', () => {
  it('cada fila del Perfil aterriza en un encabezado que la nombra', () => {
    // Si tocas "Mis comunas" y el encabezado dice otra cosa, no sabes si
    // llegaste a donde querias. No se exige igualdad literal —el encabezado
    // puede ser mas corto que la fila, como "Mis publicaciones"— pero uno tiene
    // que estar contenido en el otro.
    const porNombre = new Map(pantallas.map((p) => [p.name, p]));
    const rotas: string[] = [];
    for (const fila of filas) {
      const pantalla = porNombre.get(fila.destino);
      if (!pantalla) continue; // vive en el stack raiz: no es asunto de este test
      const t = norm(pantalla.title);
      const calza = fila.etiquetas.some((e) => norm(e).includes(t) || t.includes(norm(e)));
      if (!calza) {
        rotas.push(`${fila.destino}: fila ${JSON.stringify(fila.etiquetas)} → encabezado "${pantalla.title}"`);
      }
    }
    expect(rotas).toEqual([]);
  });
});
