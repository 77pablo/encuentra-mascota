import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

// EL BUG QUE YA SE COLO SEIS VECES EN ESTE REPO.
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
//
// SEXTA APARICION (tanda 9) — la forma ANIDADA tambien se rompe, y este archivo
// no la miraba. `PublicPetScreen` hacia:
//
//     navigate('App', { screen: 'Mapa', params: { screen: 'Chat', … } })
//
// y la pestaña 'Mapa' dejo de existir en julio (hoy son Inicio · Explorar ·
// Publicar · Adopcion · Perfil). El destino no es "pelado", asi que el chequeo
// de arriba lo dejaba pasar, y el boton "Contactar" de la pantalla que abre el
// QR de un afiche no hacia NADA. Abajo se valida la cadena entera de una
// navegacion anidada (`App → pestaña → pantalla`) CONTRA LOS NAVIGATORS, sin
// listas escritas a mano.

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

// Todo el .ts/.tsx de `src` que no sea un test: cualquier archivo puede tener
// un `navigate` anidado, no solo las pantallas del raiz.
function archivosDeFuente(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) out.push(...archivosDeFuente(ruta));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) out.push(ruta);
  }
  return out.sort();
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

// El bloque de arriba solo caza un destino que EXISTE pero esta anidado en una
// pestaña. Un destino que no existe en NINGUN navigator —una pestaña que se
// borro, un typo— se le escapaba entero, y esa es justo la forma en que el bug
// de 'Mapa' sobrevivio a la reorganizacion de 5 pestañas: el tab dejo de
// existir y nada se puso rojo.
describe('ningun navigate apunta a un destino que no existe en ningun navigator', () => {
  // Parser mas estricto que `destinosPelados`, y hace falta: aquel matchea
  // CUALQUIER `.push('x')` o `.replace('x')`, o sea tambien `array.push('email')`
  // y `texto.replace('perros', …)`. El bloque de arriba lo tolera porque despues
  // filtra por nombres que ya son pantallas conocidas; acá, donde justamente
  // buscamos los que NO estan registrados, esa laxitud daba puro falso positivo.
  // Exigimos el receptor `navigation`.
  const destinosDeNavegacion = (src: string): string[] => {
    const out: string[] = [];
    const re = /\bnavigation\??\.(?:navigate|replace|push)\(\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return [...new Set(out)];
  };

  const conocidos = new Set<string>([
    ...nombresRaiz,
    ...nombresPestanas,
    ...dentroDeUnaPestana.keys(),
  ]);

  it('el inventario de destinos conocidos no esta vacio', () => {
    // Cordura: sin esto, un parser roto haria pasar todo por lista vacia.
    expect(conocidos.size).toBeGreaterThan(10);
    expect(conocidos.has('Chat')).toBe(true);
    expect(conocidos.has('Inicio')).toBe(true);
    expect(conocidos.has('Mapa')).toBe(false); // se borro en julio
  });

  it('el parser encuentra navegaciones de verdad (no pasa por lista vacia)', () => {
    // Si `destinosDeNavegacion` dejara de matchear, todos los tests de abajo
    // pasarian sin revisar nada. Este es el seguro.
    const encontrados = archivosDeFuente(SRC).flatMap((a) =>
      destinosDeNavegacion(readFileSync(a, 'utf8')),
    );
    expect(encontrados.length).toBeGreaterThan(5);
    // Y no puede estar colando lo que no es navegacion.
    expect(encontrados).not.toContain('email');
    expect(encontrados).not.toContain('perros');
  });

  const archivosParaRevisar = archivosDeFuente(SRC);

  it('hay archivos para revisar', () => {
    expect(archivosParaRevisar.length).toBeGreaterThan(30);
  });

  archivosParaRevisar.forEach((archivo) => {
    const relativo = archivo.slice(archivo.indexOf('src'));
    it(relativo, () => {
      const src = readFileSync(archivo, 'utf8');
      const inexistentes = destinosDeNavegacion(src).filter((d) => !conocidos.has(d));
      expect({ archivo: relativo, destinosInexistentes: inexistentes }).toEqual({
        archivo: relativo,
        destinosInexistentes: [],
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

// ───────────────────────────────────────────────────────────────────────────
// NAVEGACION ANIDADA — la forma que dejo pasar la sexta aparicion del bug.
// ───────────────────────────────────────────────────────────────────────────

// Cuerpo de cada `function Nombre(…)` del archivo: desde su declaracion hasta
// la siguiente. Alcanza porque los navigators se declaran a nivel de modulo.
function cuerposDeFunciones(src: string): { nombre: string; cuerpo: string }[] {
  const re = /^(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*\(/gm;
  const marcas: { nombre: string; desde: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) marcas.push({ nombre: m[1], desde: m.index });
  return marcas.map((marca, i) => ({
    nombre: marca.nombre,
    cuerpo: src.slice(marca.desde, marcas[i + 1]?.desde ?? src.length),
  }));
}

// Componente de React → identificador del navigator que RENDERIZA.
// Ej: `InicioStack` → 'InicioStackNav', `TabNavigator` → 'Tab', `RootNavigator`
// → 'Stack'. Es lo que permite bajar un nivel en una cadena anidada.
function navigatorPorComponente(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { nombre, cuerpo } of cuerposDeFunciones(src)) {
    const nav = /<(\w+)\.Navigator\b/.exec(cuerpo)?.[1];
    if (nav) out[nombre] = nav;
  }
  return out;
}

const navPorComponente = { ...navigatorPorComponente(rootSrc), ...navigatorPorComponente(tabSrc) };

// navigator → { nombreDePantalla: componente }
const pantallasPorNavigator: Record<string, Record<string, string>> = {};
for (const r of [...registrosRaiz, ...registrosTab]) {
  (pantallasPorNavigator[r.navigator] ??= {})[r.nombre] = r.componente;
}

// El navigator HIJO que se monta al entrar a `nombre` dentro de `navigator`,
// o null si esa pantalla es una hoja (no anida nada).
function navigatorHijo(navigator: string, nombre: string): string | null {
  const componente = pantallasPorNavigator[navigator]?.[nombre];
  if (!componente) return null;
  return navPorComponente[componente] ?? null;
}

// El objeto literal balanceado que empieza en `src[i]` (que tiene que ser '{').
function objetoBalanceado(src: string, i: number): string | null {
  if (src[i] !== '{') return null;
  let nivel = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}' && --nivel === 0) return src.slice(i, j + 1);
  }
  return null;
}

// Lo que viene DESPUES de `clave:` en el primer nivel del objeto, o null.
function valorDeClave(objeto: string, clave: string): string | null {
  let nivel = 0;
  for (let i = 0; i < objeto.length; i++) {
    const c = objeto[i];
    if (c === '{') { nivel++; continue; }
    if (c === '}') { nivel--; continue; }
    if (nivel !== 1) continue;
    if (!objeto.startsWith(clave, i)) continue;
    if (/[\w$]/.test(objeto[i - 1] ?? '')) continue; // parte de otro identificador
    const resto = objeto.slice(i + clave.length);
    const sep = /^\s*:\s*/.exec(resto);
    if (!sep) continue;
    return resto.slice(sep[0].length);
  }
  return null;
}

// Cadenas de destino de las navegaciones ANIDADAS de un archivo.
// `navigate('App', { screen: 'Explorar', params: { screen: 'Chat', … } })`
// devuelve ['App', 'Explorar', 'Chat'].
function cadenasAnidadas(src: string): string[][] {
  const out: string[][] = [];
  const re = /\.(?:navigate|replace|push)\(\s*'([^']+)'\s*,\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const inicio = m.index + m[0].length;
    let objeto = objetoBalanceado(src, inicio);
    const cadena = [m[1]];
    while (objeto) {
      const trasScreen = valorDeClave(objeto, 'screen');
      const nombre = trasScreen ? /^'([^']+)'/.exec(trasScreen)?.[1] : undefined;
      if (!nombre) break;
      cadena.push(nombre);
      const trasParams = valorDeClave(objeto, 'params');
      objeto = trasParams && trasParams.startsWith('{') ? objetoBalanceado(trasParams, 0) : null;
    }
    if (cadena.length > 1) out.push(cadena);
  }
  return out;
}

// Recorre la cadena por los navigators de verdad. Devuelve el primer eslabon
// que NO existe donde deberia, o null si la cadena entera es alcanzable.
// Arranca sin saber desde donde se llama: busca el primer nombre en TODOS los
// navigators (un `navigate` anidado es absoluto solo desde 'App'; desde una
// pestaña tambien se usa `navigate('Perfil', { screen: … })`).
function eslabonRoto(cadena: string[]): { paso: number; nombre: string; en: string[] } | null {
  let posibles = new Set<string>();
  for (const navigator of Object.keys(pantallasPorNavigator)) {
    const hijo = navigatorHijo(navigator, cadena[0]);
    if (hijo) posibles.add(hijo);
  }
  // El primer nombre no monta ningun navigator anidado (o no lo conocemos):
  // no hay nada que validar acá, de eso se encarga el chequeo de destinos
  // pelados de mas arriba.
  if (posibles.size === 0) return null;

  for (let paso = 1; paso < cadena.length; paso++) {
    const nombre = cadena[paso];
    const donde = [...posibles];
    const validos = donde.filter((nav) => pantallasPorNavigator[nav]?.[nombre]);
    if (validos.length === 0) return { paso, nombre, en: donde };
    const siguientes = new Set<string>();
    for (const nav of validos) {
      const hijo = navigatorHijo(nav, nombre);
      if (hijo) siguientes.add(hijo);
    }
    if (siguientes.size === 0) return null; // llegamos a una hoja: cadena completa
    posibles = siguientes;
  }
  return null;
}

describe('el parser de navegacion anidada entiende los navigators de verdad', () => {
  // Cordura del parser: si estas dos cosas dejaran de andar, el test de abajo
  // pasaria siempre sin cubrir NADA (que es exactamente como se colo el bug).
  it('sabe que entrar a la pestaña Adopcion monta su stack', () => {
    expect(navigatorHijo('Stack', 'App')).toBe('Tab');
    expect(navigatorHijo('Tab', 'Adopcion')).toBe('AdopcionStackNav');
  });

  it('lee la cadena completa de un navigate anidado', () => {
    expect(
      cadenasAnidadas("navigation.navigate('App', { screen: 'Adopcion', params: { screen: 'Chat', params: { a: 1 } } });"),
    ).toEqual([['App', 'Adopcion', 'Chat']]);
  });

  it('caza una pestaña inexistente y tambien una pantalla inexistente', () => {
    expect(eslabonRoto(['App', 'NoExisteEstaPestana', 'Chat'])).toMatchObject({ paso: 1 });
    expect(eslabonRoto(['App', 'Adopcion', 'NoExisteEstaPantalla'])).toMatchObject({ paso: 2 });
    expect(eslabonRoto(['App', 'Adopcion', 'Chat'])).toBeNull();
  });
});

describe('toda navegacion anidada apunta a pestañas y pantallas que EXISTEN', () => {
  const archivos = archivosDeFuente(SRC);

  it('hay archivos de fuente para revisar', () => {
    expect(archivos.length).toBeGreaterThan(30);
  });

  it('hay al menos una navegacion anidada en el repo (si no, el test no cubre nada)', () => {
    const total = archivos.reduce((n, a) => n + cadenasAnidadas(readFileSync(a, 'utf8')).length, 0);
    expect(total).toBeGreaterThan(3);
  });

  it('ninguna cadena anidada de src/ apunta a un nombre que no existe', () => {
    const rotas: string[] = [];
    for (const archivo of archivos) {
      for (const cadena of cadenasAnidadas(readFileSync(archivo, 'utf8'))) {
        const roto = eslabonRoto(cadena);
        if (!roto) continue;
        rotas.push(
          `${relative(SRC, archivo)}: ${cadena.join(' → ')} · "${roto.nombre}" no existe en ${roto.en.join('/')}`,
        );
      }
    }
    expect(rotas).toEqual([]);
  });
});
