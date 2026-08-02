import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// EL AGUJERO QUE DEJÓ EL GUARDARRAÍL DE AL LADO.
//
// `casillasAccesibles.test.ts` mira los bloques que declaran
// `accessibilityRole="checkbox"` y exige que lleven el estado en las dos APIs.
// Funciona, pero se entra por el rol: un control que NO declara ningún rol no
// lo dispara nunca. No estaba roto — se lo esquivó por omisión, y así pasaron
// los chips: 26 selectores (16 en `SelectorSenas`, 10 en Explorar) que salían
// al DOM como `<div tabindex="0">Negro</div>`, sin decir que eran controles ni
// cuál estaba elegido.
//
// Este test entra por el otro lado y cierra el círculo:
//
//   1. Rol con estado (checkbox/radio/switch) → tiene que declarar el estado en
//      las DOS APIs y con la MISMA variable. `accessibilityState` es la que
//      leen VoiceOver/TalkBack en la app nativa; react-native-web 0.21 dejó de
//      traducirla EN SILENCIO, así que la web necesita además `aria-checked`.
//   2. Estado sin rol → prohibido. Anunciar "marcado" sin decir marcado QUÉ no
//      sirve para nada, y es la mitad del bug de los chips.
//   3. Un control compartido de `src/ui` que se puede tocar tiene que declarar
//      rol, porque una omisión ahí se multiplica por todas las pantallas que lo
//      usan (el `Chip` lo usan trece).
//
// Lo que este test NO puede decir es si el rol elegido es el correcto —si un
// grupo de "elegí uno" quedó como casilla, por ejemplo—: eso se monta y se mira
// en __tests__/components/chipsAccesibles.test.tsx.

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

/** Roles cuyo sentido depende de estar marcados o no. */
const ROLES_CON_ESTADO = ['checkbox', 'radio', 'switch'];

function archivosTsx(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosTsx(ruta));
    else if (entrada.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}

/**
 * Los bloques de props de cada etiqueta JSX. No sirve cortar en el primer `>`:
 * los props llevan flechas (`() => …`), comparaciones y comentarios `//`, así
 * que hay que contar llaves y saltear comillas y comentarios.
 */
function bloquesJSX(codigo: string): string[] {
  const bloques: string[] = [];
  const re = /<([A-Z][\w.]*|[a-z][\w.]*)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    let i = re.lastIndex;
    let llaves = 0;
    let comilla: string | null = null;
    let comentario = false;
    while (i < codigo.length) {
      const c = codigo[i];
      if (comentario) {
        if (c === '\n') comentario = false;
        i++;
      } else if (comilla) {
        if (c === '\\') i += 2;
        else {
          if (c === comilla) comilla = null;
          i++;
        }
      } else if (c === '/' && codigo[i + 1] === '/') {
        comentario = true;
        i += 2;
      } else if (c === '"' || c === "'" || c === '`') {
        comilla = c;
        i++;
      } else if (c === '{') {
        llaves++;
        i++;
      } else if (c === '}') {
        llaves--;
        i++;
      } else if (llaves === 0 && (c === '>' || c === '<')) {
        break;
      } else {
        i++;
      }
    }
    bloques.push(codigo.slice(m.index, i));
  }
  return bloques;
}

/** El valor de una prop: `nombre="x"` → `x`; `nombre={expr}` → `expr`. */
function prop(bloque: string, nombre: string): string | null {
  const re = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*`, 'g');
  const m = re.exec(bloque);
  if (!m) return null;
  let i = re.lastIndex;
  if (bloque[i] === '"' || bloque[i] === "'") {
    const cierre = bloque.indexOf(bloque[i], i + 1);
    return cierre === -1 ? null : bloque.slice(i + 1, cierre);
  }
  if (bloque[i] !== '{') return null;
  let llaves = 0;
  const desde = i;
  for (; i < bloque.length; i++) {
    if (bloque[i] === '{') llaves++;
    else if (bloque[i] === '}') {
      llaves--;
      if (llaves === 0) return bloque.slice(desde + 1, i).trim();
    }
  }
  return null;
}

/** El valor de una clave dentro de un objeto literal, sin comerse las que siguen. */
function clave(objeto: string | null, nombre: string): string | null {
  if (objeto === null) return null;
  const cuerpo = objeto.trim().replace(/^\{/, '').replace(/\}$/, '');
  const re = new RegExp(`(?:^|[,{])\\s*${nombre}\\s*:\\s*`);
  const m = re.exec(cuerpo);
  if (!m) return null;
  let i = m.index + m[0].length;
  let anidado = 0;
  const desde = i;
  for (; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (c === '{' || c === '(' || c === '[') anidado++;
    else if (c === '}' || c === ')' || c === ']') anidado--;
    else if (c === ',' && anidado === 0) break;
  }
  const valor = cuerpo.slice(desde, i).trim();
  return valor === '' ? null : valor;
}

const archivos = archivosTsx(SRC);
const donde = (ruta: string) => ruta.slice(ruta.indexOf('src'));

type Control = { donde: string; bloque: string; rol: string | null; aria: string | null; nativo: string | null };

const controles: Control[] = [];
for (const ruta of archivos) {
  const bloques = bloquesJSX(readFileSync(ruta, 'utf8'));
  bloques.forEach((bloque, i) => {
    const rol = prop(bloque, 'accessibilityRole') ?? prop(bloque, 'role');
    const aria = prop(bloque, 'aria-checked');
    const nativo = clave(prop(bloque, 'accessibilityState'), 'checked');
    const declaraEstado = aria !== null || nativo !== null;
    const rolConEstado = rol !== null && ROLES_CON_ESTADO.includes(rol);
    if (declaraEstado || rolConEstado) {
      controles.push({ donde: `${donde(ruta)} (control ${i + 1})`, bloque, rol, aria, nativo });
    }
  });
}

describe('todo control con estado lo dice, y todo estado dice de qué', () => {
  it('hay controles que revisar (si esto falla, el buscador quedó ciego)', () => {
    // Sin esta guarda, un cambio que rompa `bloquesJSX` dejaría todo lo de
    // abajo en verde por vacuidad.
    expect(controles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(controles.map((c) => [c.donde, c]))('%s declara un rol', (_d, control) => {
    // La mitad del bug de los chips: anunciar "marcado" sin decir marcado qué.
    // El rol puede venir de una variable (`Chip` lo elige según su prop `rol`);
    // acá alcanza con que la prop exista, el valor lo prueba el test de montaje.
    const c = control as Control;
    expect(`${c.donde}: ${c.rol === null ? 'SIN ROL' : 'ok'}`).toBe(`${c.donde}: ok`);
  });

  it.each(controles.map((c) => [c.donde, c]))(
    '%s declara el estado en las DOS APIs y con la misma variable',
    (_d, control) => {
      const c = control as Control;
      // `aria-checked` para la web (react-native-web 0.21 ya no traduce
      // `accessibilityState`) y `accessibilityState` para iOS/Android. Un
      // copy-paste que las separe da un lector que miente, peor que uno mudo.
      expect(`${c.donde}: aria-checked=${c.aria} accessibilityState.checked=${c.nativo}`).toBe(
        `${c.donde}: aria-checked=${c.aria} accessibilityState.checked=${c.aria}`,
      );
      expect(`${c.donde}: ${c.aria === null ? 'SIN ESTADO' : 'ok'}`).toBe(`${c.donde}: ok`);
    },
  );
});

// Los controles compartidos: una omisión acá no es una pantalla, son todas.
// `Chip` lo usan trece archivos; si el rol no está en el componente, ninguno de
// los trece lo tiene.
// Vacío a propósito, y que siga así: cada entrada acá es un control que el
// guardián NO revisa. `Button.tsx` estuvo anotado mientras el arreglo de `Chip`
// no podía tocarlo (era de otra tarea de la misma tanda); se arregló en la
// revisión final y la excepción se sacó en el mismo commit. Una excepción que
// sobrevive al arreglo es peor que no tener el test: lo apaga en silencio justo
// para el componente que más se usa.
const PENDIENTES: Record<string, string> = {};

const compartidos = readdirSync(join(SRC, 'ui'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ archivo: f, codigo: readFileSync(join(SRC, 'ui', f), 'utf8') }))
  .filter(({ codigo }) => /<(TouchableOpacity|Pressable|TouchableHighlight)[\s/>]/.test(codigo));

describe('los controles compartidos de src/ui dicen qué son', () => {
  it('hay componentes pulsables que revisar', () => {
    expect(compartidos.length).toBeGreaterThan(0);
  });

  it.each(compartidos.map((c) => [c.archivo, c.codigo]))(
    '%s declara el rol de lo que se puede tocar',
    (archivo, codigo) => {
      if (PENDIENTES[archivo as string]) return;
      const pulsables = bloquesJSX(codigo as string).filter((b) =>
        /^<(TouchableOpacity|Pressable|TouchableHighlight)[\s/]/.test(b),
      );
      expect(pulsables.length).toBeGreaterThan(0);
      for (const bloque of pulsables) {
        const rol = prop(bloque, 'accessibilityRole') ?? prop(bloque, 'role');
        expect(`${archivo}: ${rol === null ? 'SIN ROL' : 'ok'}`).toBe(`${archivo}: ok`);
      }
    },
  );

  it('cada pendiente apunta a un archivo que existe', () => {
    // Un pendiente que apunta a un archivo que ya no está es un permiso suelto:
    // o se arregló y hay que borrar la entrada, o se renombró y hay que
    // seguirlo. Lo que no puede es quedar acá adentro sin que nadie lo mire.
    //
    // Va como un `it` que recorre la lista y no como `it.each`: con la lista
    // vacía —que es el estado deseable— `it.each` falla por definición, y el
    // día que alguien vacíe la lista al arreglar el último pendiente se
    // encontraría con un rojo que no entiende.
    const archivos = compartidos.map((c) => c.archivo);
    const fantasmas = Object.keys(PENDIENTES).filter((a) => !archivos.includes(a));
    expect(fantasmas).toEqual([]);
  });
});
