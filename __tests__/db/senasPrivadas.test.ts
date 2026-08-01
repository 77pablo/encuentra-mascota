import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// ============================================================
// GUARDIÁN — LA SEÑA SECRETA NO SALE A NINGUNA VISTA PÚBLICA.
//
// Es EL requisito de la función. Una seña que se filtra no es solo inútil: es
// peor que no tenerla, porque el dueño confía en una verificación que el
// estafador ya leyó en el aviso. Hermano del guardián de `mascota_por_collar`
// (`collarPrivacidad.test.ts`), con la misma técnica: leer el código y la
// migración, y fallar acá antes de que lo encuentre alguien afuera.
//
// La defensa es ESTRUCTURAL, no una policy con suerte: las señas viven en su
// PROPIA tabla (`pet_senas_privadas`), no en una columna de `pets`. `pets` se
// lee con `select('*')` en media app y con RPCs públicas de búsqueda; una
// columna nueva ahí habría estado a un `select('*')` de distancia de salir
// impresa. En una tabla aparte, para filtrarla hay que ir a buscarla a propósito.
// ============================================================

const RAIZ = join(__dirname, '..', '..');
const TABLA = 'pet_senas_privadas';
// Los nombres de las columnas privadas. `senas` a secas NO va en esta lista: es
// una palabra que ya usa el proyecto para cosas públicas (`my_pets.senas`, y el
// campo `senas` del afiche, que es la descripción publicada).
const COLUMNAS_PRIVADAS = ['sena_1', 'sena_2'];

function leer(rel: string): string {
  return readFileSync(join(RAIZ, ...rel.split('/')), 'utf8');
}

// Los guardianes de SQL miran CÓDIGO, no comentarios: si no, un `--` que explique
// por qué NO hay una función que saltea la RLS haría fallar justo al test que
// comprueba que no la hay.
function sinComentarios(sql: string): string {
  return sql
    .split('\n')
    // Sin `$`: los archivos del repo vienen con CRLF y `.` no cruza el `\r`.
    .map((l) => l.replace(/--.*/, ''))
    .join('\n');
}

function archivosDe(dir: string, exts: string[]): string[] {
  const salida: string[] = [];
  const recorrer = (d: string) => {
    for (const nombre of readdirSync(d)) {
      const p = join(d, nombre);
      if (statSync(p).isDirectory()) {
        if (nombre === 'node_modules') continue;
        recorrer(p);
      } else if (exts.some((e) => nombre.endsWith(e))) {
        salida.push(p);
      }
    }
  };
  recorrer(join(RAIZ, ...dir.split('/')));
  return salida;
}

const rel = (p: string) => relative(RAIZ, p).split(sep).join('/');

// ------------------------------------------------------------
// 1. La migración: la tabla es del dueño y de nadie más.
// ------------------------------------------------------------
describe('migración 0047 — la tabla de señas privadas está cerrada', () => {
  const sql = sinComentarios(leer('supabase/migrations/0047_senas_privadas.sql'));

  it('crea la tabla con RLS encendida', () => {
    expect(sql).toContain(`create table public.${TABLA}`);
    expect(sql).toContain(`alter table public.${TABLA} enable row level security`);
  });

  it('la única policy es del dueño y no alcanza a anon', () => {
    const iPolicy = sql.indexOf(`on public.${TABLA} for`);
    expect(iPolicy).toBeGreaterThanOrEqual(0);
    const policy = sql.slice(iPolicy, sql.indexOf(';', iPolicy));
    expect(policy).toContain('to authenticated');
    expect(policy).toContain('auth.uid() = user_id');
    expect(policy).not.toContain('anon');
    // Y hay una sola: dos policies de select se SUMAN en Postgres (son OR), así
    // que una segunda más laxa anularía a esta sin que nadie lo note.
    expect(sql.match(new RegExp(`on public\\.${TABLA} for`, 'g'))).toHaveLength(1);
  });

  it('le revoca todo a anon y a public (fail-closed, patrón de la 0018)', () => {
    // Sin esto, los grants por defecto del esquema public de Supabase le dan
    // `select` a anon; la RLS lo taparía igual, pero preferimos que el permiso
    // no exista antes que confiar en una sola capa.
    const revoke = sql.match(new RegExp(`revoke all on public\\.${TABLA} from [^;]*;`))?.[0] ?? '';
    expect(revoke).toContain('anon');
    expect(revoke).toContain('public');
  });

  it('no le da ningún permiso a anon', () => {
    for (const grant of sql.match(/grant [^;]*;/g) ?? []) {
      if (!grant.includes(TABLA)) continue;
      expect(grant).not.toContain('anon');
    }
  });

  it('NO crea ninguna función security definer (nada que saltee la RLS)', () => {
    // `security definer` corre con los permisos del dueño de la función y se
    // salta la RLS. Es la puerta trasera clásica: una RPC "auxiliar" que
    // devuelva la seña haría que todo lo de arriba fuera decorativo.
    expect(sql).not.toContain('security definer');
  });

  it('la seña no puede colgarse del reporte de otra persona', () => {
    // `with check` mira que el reporte también sea tuyo: si no, cualquiera
    // podría escribir una "seña" en el reporte de un vecino.
    const iPolicy = sql.indexOf(`on public.${TABLA} for`);
    const policy = sql.slice(iPolicy, sql.indexOf(';', iPolicy));
    expect(policy).toContain('with check');
    expect(policy).toMatch(/from public\.pets/);
  });
});

// ------------------------------------------------------------
// 2. Ninguna otra migración toca la tabla ni sus columnas.
// ------------------------------------------------------------
describe('GUARDIÁN — ninguna RPC ni vista de la base devuelve la seña', () => {
  const migraciones = archivosDe('supabase/migrations', ['.sql']);

  it('la tabla solo aparece en su propia migración', () => {
    const otras = migraciones
      .filter((p) => !p.endsWith('0047_senas_privadas.sql'))
      .filter((p) => sinComentarios(readFileSync(p, 'utf8')).includes(TABLA))
      .map(rel);
    expect(otras).toEqual([]);
  });

  it('las columnas privadas no aparecen en ninguna otra migración', () => {
    const culpables: string[] = [];
    for (const p of migraciones) {
      if (p.endsWith('0047_senas_privadas.sql')) continue;
      const sql = sinComentarios(readFileSync(p, 'utf8'));
      for (const col of COLUMNAS_PRIVADAS) {
        if (sql.includes(col)) culpables.push(`${rel(p)} → ${col}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('ninguna función de la base con `returns table` las lista', () => {
    // Barrido directo sobre las firmas de retorno: es exactamente por donde se
    // escapó el contacto antes de la 0018.
    const culpables: string[] = [];
    for (const p of migraciones) {
      const sql = sinComentarios(readFileSync(p, 'utf8'));
      for (const m of sql.match(/returns table\s*\([^)]*\)/gis) ?? []) {
        for (const col of [...COLUMNAS_PRIVADAS, TABLA]) {
          if (m.includes(col)) culpables.push(`${rel(p)} → ${col}`);
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  // Mirado desde `anon` (sin sesión), que es el peor caso: no hay `auth.uid()`,
  // así que cualquier `security definer` al que anon pueda llamar sería la única
  // vía posible de fuga. Se listan las funciones que tienen `grant execute ... to
  // anon` y se revisa el CUERPO de cada una.
  it('ninguna función ejecutable por anon menciona la seña', () => {
    const cuerpos: { nombre: string; cuerpo: string; archivo: string }[] = [];
    const alcanzablesPorAnon = new Set<string>();

    for (const p of migraciones) {
      const sql = sinComentarios(readFileSync(p, 'utf8'));
      for (const g of sql.match(/grant execute on function public\.([a-z0-9_]+)[^;]*;/gi) ?? []) {
        if (/\bto\b[^;]*\banon\b/i.test(g)) {
          alcanzablesPorAnon.add(/public\.([a-z0-9_]+)/i.exec(g)![1].toLowerCase());
        }
      }
      const re = /create (?:or replace )?function public\.([a-z0-9_]+)([\s\S]*?)\$\$;/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql))) {
        cuerpos.push({ nombre: m[1].toLowerCase(), cuerpo: m[2], archivo: rel(p) });
      }
    }

    // Anti-tautología: si la extracción se rompiera, el test pasaría vacío y no
    // estaría comprobando nada. `mascota_por_collar` es la RPC pública de la 0027
    // y tiene que estar sí o sí en esta lista.
    expect(alcanzablesPorAnon.has('mascota_por_collar')).toBe(true);
    expect(cuerpos.length).toBeGreaterThan(5);

    const culpables = cuerpos
      .filter((f) => alcanzablesPorAnon.has(f.nombre))
      .filter((f) => [...COLUMNAS_PRIVADAS, TABLA].some((a) => f.cuerpo.includes(a)))
      .map((f) => `${f.archivo} → ${f.nombre}`);
    expect(culpables).toEqual([]);
  });
});

// ------------------------------------------------------------
// El guardrail de "esta es la última migración" NO vive acá: viajó a la 0048
// (cuadrilla), que quedó siendo la más nueva.
//
// El comentario que estaba en este mismo lugar avisaba "si otra tanda agrega una
// 0048, hay que moverlo otra vez, no duplicarlo" — y fue exactamente lo que
// pasó: tres agentes en paralelo lo mudaron cada uno a su migración y el merge
// dejó tres copias afirmando 46, 47 y 48.
// ------------------------------------------------------------

// ------------------------------------------------------------
// 3. Del lado de la app: quién puede siquiera nombrarla.
// ------------------------------------------------------------
describe('GUARDIÁN — en la app, la seña solo la toca el dueño', () => {
  const fuentes = archivosDe('src', ['.ts', '.tsx']);

  it('la tabla se nombra en un solo archivo: el servicio', () => {
    // Sin `sinComentarios` a propósito: en TypeScript la regla es más estricta,
    // ni siquiera un comentario tiene por qué nombrar la tabla fuera del servicio.
    const quienes = fuentes.filter((p) => readFileSync(p, 'utf8').includes(TABLA)).map(rel);
    expect(quienes).toEqual(['src/services/senasPrivadas.ts']);
  });

  it('solo las pantallas del dueño importan el servicio', () => {
    // Lista CERRADA. Agregar una pantalla acá es una decisión consciente, y
    // ninguna de estas tres es pública:
    //   · PublishScreen  — el dueño guarda la seña al publicar.
    //   · EditPetScreen  — el dueño la corrige.
    //   · ChatScreen     — el dueño la relee para verificar a quien lo contactó.
    const PERMITIDAS = [
      'src/screens/ChatScreen.tsx',
      'src/screens/EditPetScreen.tsx',
      'src/screens/PublishScreen.tsx',
    ];
    const quienes = fuentes
      .filter((p) => /from ['"][^'"]*services\/senasPrivadas['"]/.test(readFileSync(p, 'utf8')))
      .map(rel)
      .sort();
    expect(quienes).toEqual(PERMITIDAS);
  });

  it('ninguna vista pública nombra la seña privada', () => {
    // Estas son las superficies que ve cualquiera (con sesión ajena, sin sesión,
    // o impresas y pegadas en un poste).
    const VISTAS_PUBLICAS = [
      'src/screens/PublicPetScreen.tsx',
      'src/screens/PublicProfileScreen.tsx',
      'src/screens/CollarScreen.tsx',
      'src/screens/ExplorarScreen.tsx',
      'src/components/PetCard.tsx',
      'src/components/AfichePoster.tsx',
      'src/components/TarjetaCompartir.tsx',
      'src/lib/afiche.ts',
      'src/lib/share.ts',
      'src/lib/tarjeta.ts',
    ];
    const culpables: string[] = [];
    for (const r of VISTAS_PUBLICAS) {
      const fuente = leer(r);
      for (const aguja of [TABLA, 'sena_1', 'sena_2', 'senaPrivada', 'senasPrivadas', 'senaSecreta']) {
        if (fuente.includes(aguja)) culpables.push(`${r} → ${aguja}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('el tipo `Pet` no tiene campo de seña privada', () => {
    // `Pet` se llena con `select('*')` sobre `pets` y se pasa entero a PetCard,
    // al afiche y al texto de compartir. Si la seña llegara a vivir ahí, se
    // filtraría sola.
    const fuente = leer('src/services/pets.ts');
    const iface = fuente.slice(fuente.indexOf('export interface Pet {'));
    const cuerpo = iface.slice(0, iface.indexOf('\n}'));
    for (const aguja of ['sena', 'seña']) {
      expect(cuerpo.toLowerCase()).not.toContain(aguja);
    }
  });

  it('el servicio nunca pide la seña junto con las columnas de `pets`', () => {
    // Doble motivo. (1) Privacidad: un join dejaría la seña colgando de una
    // consulta que hacen todas las pantallas. (2) Trampa de PostgREST: pedir una
    // columna/tabla que todavía no existe (base sin la 0047 aplicada) hace
    // fallar la consulta ENTERA, así que el reporte no cargaría en ninguna parte.
    const fuente = leer('src/services/senasPrivadas.ts');
    expect(fuente).not.toMatch(/from\(['"]pets['"]\)/);
    expect(fuente).not.toContain('!inner');
  });
});
