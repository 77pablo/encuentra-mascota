import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// EL BUG QUE YA SE COLO CUATRO VECES EN ESTE REPO.
//
// React Navigation resuelve un `navigate('Nombre')` pelado buscando esa pantalla
// en el navigator actual y, si no esta, BURBUJEANDO hacia sus ANCESTROS. Nunca
// hacia abajo ni hacia los hermanos.
//
// Consecuencia: una pantalla registrada en el stack RAIZ (MascotaPublica,
// AdopcionDetail, Collar, las guias…) NO puede alcanzar por nombre pelado una
// pantalla que vive DENTRO del stack de una pestaña (Chat, PetDetail,
// EditAdoption, Bloqueados…). Hay que usar la forma anidada:
//
//     navigate('App', { screen: '<Pestaña>', params: { screen: '<Pantalla>', … } })
//
// Este test LEE LOS NAVIGATORS DE VERDAD (`RootNavigator.tsx` y
// `TabNavigator.tsx`) y el codigo de cada pantalla del raiz. No hay ninguna
// lista blanca escrita a mano en este archivo: si alguien registra una pantalla
// nueva, la mueve de stack o agrega un `navigate` pelado, el test se entera
// solo. (Ya se escribieron dos veces tests tautologicos que declaraban la
// respuesta en el propio test y no cubrian nada.)

const SRC = join(__dirname, '..', '..', 'src');
const NAV = join(SRC, 'navigation');
const rootSrc = readFileSync(join(NAV, 'RootNavigator.tsx'), 'utf8');
const tabSrc = readFileSync(join(NAV, 'TabNavigator.tsx'), 'utf8');

type Registro = { navigator: string; nombre: string; componente: string };

// Todos los `<XxxNav.Screen name="…" component={Yyy} … />` de un archivo.
// Son elementos autocerrados en los dos navigators, asi que el corte por `/>`
// es exacto.
function pantallasDe(src: string): Registro[] {
  const out: Registro[] = [];
  const re = /<(\w+)\.Screen\b([\s\S]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, navigator, attrs] = m;
    const nombre = /name="([^"]+)"/.exec(attrs)?.[1];
    const componente = /component=\{(\w+)\}/.exec(attrs)?.[1];
    if (nombre && componente) out.push({ navigator, nombre, componente });
  }
  return out;
}

// `import Xxx from '../screens/Yyy'` → { Xxx: rutaAbsoluta }
function importesDePantallas(src: string, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /import\s+(\w+)\s+from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const [, ident, ruta] = m;
    if (!ruta.startsWith('.')) continue;
    for (const ext of ['.tsx', '.ts']) {
      const abs = join(base, ruta + ext);
      if (existsSync(abs)) {
        out[ident] = abs;
        break;
      }
    }
  }
  return out;
}

const registrosRaiz = pantallasDe(rootSrc);
const registrosTab = pantallasDe(tabSrc);

// Lo que un `navigate` pelado PUEDE alcanzar desde una pantalla del stack raiz:
// las pantallas del propio raiz + las pestañas (que son hijas de `App`, y `App`
// esta en el raiz, pero React Navigation tambien resuelve el nombre de la
// pestaña por burbujeo desde el raiz).
const nombresRaiz = new Set(registrosRaiz.map((r) => r.nombre));
const nombresPestanas = new Set(
  registrosTab.filter((r) => r.navigator === 'Tab').map((r) => r.nombre),
);
const alcanzableDesdeElRaiz = new Set([...nombresRaiz, ...nombresPestanas]);

// Pantallas que viven DENTRO del stack de una pestaña (no alcanzables peladas
// desde el raiz), con el nombre de su stack para el mensaje de error.
const dentroDeUnaPestana = new Map<string, string>();
for (const r of registrosTab) {
  if (r.navigator === 'Tab') continue;
  if (!dentroDeUnaPestana.has(r.nombre)) dentroDeUnaPestana.set(r.nombre, r.navigator);
}

// Todos los `navigation.navigate('X'`, `.replace('X'`, `.push('X'` de un archivo.
function destinosPelados(src: string): string[] {
  const out: string[] = [];
  const re = /\.(?:navigate|replace|push)\(\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

describe('los navigators se leen de verdad (el test no inventa la respuesta)', () => {
  it('encuentra pantallas registradas en los dos archivos', () => {
    expect(registrosRaiz.length).toBeGreaterThan(5);
    expect(registrosTab.length).toBeGreaterThan(15);
    expect(nombresPestanas.size).toBeGreaterThanOrEqual(4);
  });

  it('sabe distinguir lo que vive dentro de una pestaña', () => {
    // Chequeo de cordura del propio parser: si dejara de reconocer los stacks
    // anidados, el test de abajo pasaria siempre sin cubrir nada.
    expect(dentroDeUnaPestana.has('Chat')).toBe(true);
    expect(dentroDeUnaPestana.has('PetDetail')).toBe(true);
    expect(alcanzableDesdeElRaiz.has('Chat')).toBe(false);
  });
});

describe('ninguna pantalla del stack RAIZ navega a un tab por nombre pelado', () => {
  const importesRaiz = importesDePantallas(rootSrc, NAV);
  const pantallasDelRaiz = registrosRaiz
    .map((r) => ({ ...r, archivo: importesRaiz[r.componente] }))
    .filter((r) => r.archivo && r.archivo.includes('screens'));

  it('hay pantallas del raiz para revisar', () => {
    expect(pantallasDelRaiz.length).toBeGreaterThan(3);
  });

  pantallasDelRaiz.forEach(({ nombre, componente, archivo }) => {
    it(`${nombre} (${componente})`, () => {
      const src = readFileSync(archivo!, 'utf8');
      const malos = destinosPelados(src).filter(
        (d) => !alcanzableDesdeElRaiz.has(d) && dentroDeUnaPestana.has(d),
      );
      expect({ pantalla: nombre, destinosInalcanzables: malos }).toEqual({
        pantalla: nombre,
        destinosInalcanzables: [],
      });
    });
  });
});

describe('las entradas nuevas del Perfil apuntan a pantallas que existen', () => {
  // `ProfileScreen` vive DENTRO de ProfileStack, asi que un nombre pelado
  // alcanza a sus hermanos. Lo que se verifica es que el destino este
  // registrado en alguna parte y no sea un nombre inventado.
  const perfilSrc = readFileSync(join(SRC, 'screens', 'ProfileScreen.tsx'), 'utf8');
  const registradosEnProfileStack = new Set(
    registrosTab.filter((r) => r.navigator === 'ProfileStackNav').map((r) => r.nombre),
  );

  it('"Personas bloqueadas" existe como pantalla de ProfileStack', () => {
    expect(perfilSrc).toContain("navigation.navigate('Bloqueados')");
    expect(registradosEnProfileStack.has('Bloqueados')).toBe(true);
  });

  it('todo destino pelado del Perfil es hermano suyo, una pestaña o del raiz', () => {
    const alcanzableDesdeElPerfil = new Set([
      ...registradosEnProfileStack,
      ...nombresPestanas,
      ...nombresRaiz,
    ]);
    const malos = destinosPelados(perfilSrc).filter((d) => !alcanzableDesdeElPerfil.has(d));
    expect(malos).toEqual([]);
  });
});
