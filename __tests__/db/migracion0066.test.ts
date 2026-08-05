import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0066_rastro_publico.sql'), 'utf8');

// El cliente que consume esta migracion: el guardian de "no expone al autor"
// no alcanza mirando solo el SQL (finding 1 de la revision) — si el grant de
// columna esta bien pero el service igual manda `select('*')`, PostgREST
// devuelve 42501 (rompe la pantalla) en vez de filtrar, pero un service que
// por error mandara `select('user_id, ...')` explicito SI se colaria. Se lee
// el archivo fuente para comprobar el camino sin sesion de verdad.
const clienteSightings = readFileSync(
  join(__dirname, '..', '..', 'src', 'services', 'sightings.ts'), 'utf8');

// Saca los comentarios de linea ("-- ...") antes de aplicar una asercion
// NEGATIVA. Sin esto, un `expect(sql).not.toMatch(...)` se puede volver verde
// escribiendo el patron prohibido DENTRO de un comentario en vez de sacarlo
// de verdad del SQL — el propio texto de esta migracion tiene parrafos largos
// de comentario que mencionan `drop policy`, `grant`, `authenticated`, etc.
// como explicacion, no como codigo.
function sinComentarios(fuente: string): string {
  return fuente
    .split('\n')
    .map((linea) => {
      const i = linea.indexOf('--');
      return i === -1 ? linea : linea.slice(0, i);
    })
    .join('\n');
}

const codigo = sinComentarios(sql);

describe('0066: el rastro para quien llega por el QR', () => {
  it('la policy nueva REPITE los filtros de la ficha (no los hereda)', () => {
    expect(sql).toMatch(/p\.activo/);
    expect(sql).toMatch(/p\.oculto = false/);
  });

  it('es solo de lectura y solo para anon', () => {
    expect(sql).toMatch(/for select to anon/);
    expect(sql).not.toMatch(/for (insert|update|delete) to anon/);
  });

  // ── Finding 2 de la revision: el test viejo buscaba la palabra INGLESA
  // "authenticated" en un `drop policy`, y esa palabra aparece en el archivo
  // en usos legitimos (`to authenticated`, comentarios). Cualquier
  // `drop policy "otra cosa" on public.algo;` sin la palabra "authenticated"
  // hubiera pasado el test viejo igual, sin que probara nada. Ahora se busca
  // el NOMBRE REAL de la policy (español, 0007:18) y, en general, cualquier
  // `drop policy` sobre `public.sightings`.
  it('no dropea la policy de authenticated que ya existia (0007:18, nombre real)', () => {
    expect(codigo).not.toMatch(/drop policy[^;]*avistamientos visibles para autenticados/);
    expect(codigo).not.toMatch(/drop policy[^;]*on public\.sightings/);
  });

  // ── Finding 1 de la revision: el test viejo (`grant[^;]*profiles[^;]*to
  // anon`) era vacuo — esta migracion nunca tocó `profiles`, así que ese
  // regex jamás podía fallar aunque el grant nuevo sobre `sightings`
  // expusiera `user_id` y `foto` de punta a punta. Ahora se parsea la lista
  // de columnas del `grant select` real, igual que hace
  // `migracion0064.test.ts` con `pet_fotos_vector`.
  it('el grant de columna a anon NUNCA incluye user_id ni foto (deanonimizarian al autor)', () => {
    const grants = codigo.match(/grant\s+select[^;]*;/g) ?? [];
    const grantsAAnon = grants.filter((g) => /\bto\s+anon\b/.test(g));
    expect(grantsAAnon.length).toBeGreaterThan(0);
    for (const g of grantsAAnon) {
      // Grant de columna EXPLICITO — nunca "grant select on ... to anon" a
      // secas, que da la fila completa (la trampa que motivo este fix: el
      // grant de tabla por defecto de Supabase ya le daba a anon las 8
      // columnas de `sightings`, incluidas `user_id` y `foto`).
      expect(g).toMatch(/grant\s+select\s*\([^)]+\)/);
      const columnas = g.match(/grant\s+select\s*\(([^)]+)\)/)![1];
      expect(columnas).not.toMatch(/\buser_id\b/);
      expect(columnas).not.toMatch(/\bfoto\b/);
    }
  });

  it('el grant de columna a anon SI incluye lo que PublicPetScreen necesita', () => {
    const grants = codigo.match(/grant\s+select\s*\(([^)]+)\)[^;]*to\s+anon[^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    const columnas = grants[0]!.match(/\(([^)]+)\)/)![1];
    for (const col of ['id', 'pet_id', 'lat', 'lng', 'nota', 'creado_en']) {
      expect(columnas).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('el revoke es SOLO sobre anon: authenticated conserva su select completo', () => {
    const revokes = codigo.match(/revoke select[^;]*;/g) ?? [];
    expect(revokes.length).toBeGreaterThan(0);
    for (const r of revokes) {
      expect(r).toMatch(/from anon\b/);
      expect(r).not.toMatch(/\bauthenticated\b/);
    }
  });

  // Guardian de extremo a extremo (finding 1): no alcanza con que la 0066
  // recorte el grant si el cliente igual manda `select('*')` en el camino sin
  // sesion — eso daria 42501 en vez de una fuga, pero solo un test que lea
  // el service de verdad lo detecta. Se comprueba que el camino sin sesion
  // pide EXACTAMENTE la lista concedida, nunca `*`, `user_id` ni `foto`.
  it('el cliente (services/sightings.ts) nunca selecciona user_id, foto ni * en el camino sin sesion', () => {
    const seleccionSinSesion = clienteSightings.match(
      /const columnas: string = conSesion \? '\*' : '([^']*)'/,
    );
    expect(seleccionSinSesion).not.toBeNull();
    const columnas = seleccionSinSesion![1];
    expect(columnas).not.toMatch(/\*/);
    expect(columnas).not.toMatch(/\buser_id\b/);
    expect(columnas).not.toMatch(/\bfoto\b/);
    for (const col of ['id', 'pet_id', 'lat', 'lng', 'nota', 'creado_en']) {
      expect(columnas).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  // ── Finding 3 de la revision: el test viejo ("solo lectura") solo
  // comprobaba que la UNICA policy de este archivo fuera `for select`, pero
  // no decia nada sobre otras policies o grants de escritura que pudieran
  // aparecer en el mismo archivo. Ahora son aserciones NEGATIVAS amplias
  // sobre el archivo entero (sin comentarios), que no se satisfacen por
  // vacuidad de "la unica policy que hay es esta": agarran CUALQUIER policy
  // de escritura para anon/public y CUALQUIER grant de escritura sobre
  // `sightings`, aparezcan donde aparezcan.
  it('solo lectura: ninguna policy de escritura (for all/insert/update/delete) para anon o public', () => {
    expect(codigo).not.toMatch(/for\s+(all|insert|update|delete)\b[^;]*\bto\s+(anon|public)\b/);
  });

  it('solo lectura: ningun grant de insert/update/delete sobre public.sightings', () => {
    expect(codigo).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*on public\.sightings/);
  });
});
