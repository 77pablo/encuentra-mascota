import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0064_vectores_de_foto.sql'), 'utf8');

// Parte el archivo en bloques "create policy ... ;" para poder revisar cada
// policy POR SEPARADO. Un test que sólo busca una subcadena en TODO el
// archivo pasa por vacuidad: si el `with check` del INSERT existe, ese mismo
// match satisface un regex que en realidad queria comprobar el del UPDATE,
// aunque a ESE se le hubiera sacado por error (la forma exacta del agujero de
// escalada de `profiles` que el comentario de esta misma migracion cita).
function policyBlocks(fuente: string): { encabezado: string; cuerpo: string }[] {
  const bloques: { encabezado: string; cuerpo: string }[] = [];
  const re = /create policy "([^"]+)"([\s\S]*?);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuente)) !== null) {
    bloques.push({ encabezado: m[1], cuerpo: m[0] });
  }
  return bloques;
}

describe('0064: vectores de foto', () => {
  it('NO agrega columnas a pets', () => {
    expect(sql).not.toMatch(/alter table public\.pets add column/);
  });

  it('la extension se crea de forma idempotente', () => {
    expect(sql).toMatch(/create extension if not exists vector/);
  });

  it('el vector tiene las 512 dimensiones de CLIP ViT-B\/32', () => {
    expect(sql).toMatch(/embedding vector\(512\)/);
  });

  it('una foto no se vectoriza dos veces', () => {
    expect(sql).toMatch(/unique \(pet_id, foto_url\)/);
  });

  it('el vector lo escribe el dueño del reporte y NADIE mas', () => {
    expect(sql).toMatch(/alter table public\.pet_fotos_vector enable row level security/);
    // El cliente web calcula el vector (B1 dio NO-GO en el servidor), asi que
    // tiene que poder escribir — pero solo sobre SUS reportes.
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/with check/);
  });

  it('anon no escribe ni lee vectores', () => {
    expect(sql).toMatch(/revoke[^;]*on public\.pet_fotos_vector from[^;]*anon/);
    expect(sql).not.toMatch(/to anon/);
  });

  it('se borra con el reporte', () => {
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
  });

  // ── La policy de UPDATE ya no es letra muerta ───────────────────────────
  // Sin ninguna policy de SELECT, Postgres no puede evaluar el `where` de un
  // UPDATE (ni el `.eq(...).eq(...)` que emite supabase-js): rechaza con
  // 42501 incluso al dueño legitimo. Medido contra la base real (ver el
  // reporte de esta tarea). El arreglo: una policy de SELECT acotada al
  // dueño, PERO sin exponer `embedding` (eso lo hace el grant de columna).

  it('hay exactamente una policy de SELECT, y esta acotada al dueño', () => {
    const bloques = policyBlocks(sql).filter((b) => /for select/.test(b.cuerpo));
    expect(bloques).toHaveLength(1);
    expect(bloques[0].cuerpo).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('la policy de SELECT NO lleva with check (solo using: es de lectura)', () => {
    const [select] = policyBlocks(sql).filter((b) => /for select/.test(b.cuerpo));
    expect(select.cuerpo).toMatch(/using \(/);
    expect(select.cuerpo).not.toMatch(/with check/);
  });

  it('el grant de SELECT es por columna y jamas incluye `embedding`', () => {
    const grants = sql.match(/grant select[^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      // Tiene que ser un grant de columna explicito -- "grant select (a, b, ...)" --
      // nunca "grant select on ..." a secas, que da la tabla completa.
      expect(g).toMatch(/grant select\s*\([^)]+\)/);
      expect(g).not.toMatch(/\bembedding\b/);
    }
  });

  it('el grant de SELECT por columna SI incluye pet_id y foto_url (para que el where funcione)', () => {
    const grants = sql.match(/grant select\s*\(([^)]+)\)[^;]*;/) ;
    expect(grants).not.toBeNull();
    const columnas = grants![1];
    expect(columnas).toMatch(/\bpet_id\b/);
    expect(columnas).toMatch(/\bfoto_url\b/);
  });

  // ── Cada policy de escritura tiene SU PROPIO with check ─────────────────
  // (no basta con que la subcadena "with check" aparezca en algun lugar del
  // archivo: tiene que estar DENTRO del bloque de la policy de INSERT y
  // DENTRO del bloque de la policy de UPDATE, por separado).

  it('la policy de INSERT tiene su propio with check', () => {
    const [insert] = policyBlocks(sql).filter((b) => /for insert/.test(b.cuerpo));
    expect(insert).toBeDefined();
    expect(insert.cuerpo).toMatch(/with check \(/);
    expect(insert.cuerpo).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('la policy de UPDATE tiene su propio with check (no solo using)', () => {
    const [update] = policyBlocks(sql).filter((b) => /for update/.test(b.cuerpo));
    expect(update).toBeDefined();
    expect(update.cuerpo).toMatch(/using \(/);
    expect(update.cuerpo).toMatch(/with check \(/);
    expect(update.cuerpo).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('hay exactamente 3 policies: select, insert, update (ninguna de delete)', () => {
    const bloques = policyBlocks(sql);
    expect(bloques).toHaveLength(3);
    expect(bloques.filter((b) => /for select/.test(b.cuerpo))).toHaveLength(1);
    expect(bloques.filter((b) => /for insert/.test(b.cuerpo))).toHaveLength(1);
    expect(bloques.filter((b) => /for update/.test(b.cuerpo))).toHaveLength(1);
    expect(bloques.filter((b) => /for delete/.test(b.cuerpo))).toHaveLength(0);
  });

  it('no hay grant de delete para nadie', () => {
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*on public\.pet_fotos_vector/);
  });
});
