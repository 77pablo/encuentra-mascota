import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0062_foto_aviso_anonimo.sql'),
  'utf8',
);

describe('0062: la foto del aviso anónimo solo la ve el dueño', () => {
  it('el bucket es PRIVADO (public = false): sin URL adivinable', () => {
    expect(sql).toMatch(/values \('avisos-anonimos', 'avisos-anonimos', false\)/);
  });

  it('el SELECT exige ser dueño del reporte de la carpeta', () => {
    expect(sql).toMatch(/for select to authenticated/);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\]/);
    expect(sql).toMatch(/p\.user_id = auth\.uid\(\)/);
  });

  it('anon no puede subir: no existe policy de insert en este bucket', () => {
    expect(sql).not.toMatch(/for insert/);
  });

  it('la foto solo la fija service_role: la RPC la anula para cualquier otro rol', () => {
    expect(sql).toMatch(/auth\.role\(\) <> 'service_role'/);
  });

  it('la firma de 5 se dropea y la de 6 re-otorga a anon y authenticated', () => {
    expect(sql).toMatch(/drop function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\)/);
    expect(sql).toMatch(/to anon/);
  });

  it('la función devuelve boolean, no void: la señal de descarte viaja en el retorno', () => {
    expect(sql).toMatch(/returns boolean/);
    expect(sql).not.toMatch(/returns void/);
  });

  it('no hay excepción de descarte: un raise exception haría rollback del correo de seguimiento ya insertado', () => {
    expect(sql).not.toMatch(/aviso_descartado/);
    expect(sql).not.toMatch(/raise exception/);
  });

  it('cada uno de los 5 descartes silenciosos devuelve `p_foto_path is null` (true para el anónimo sin foto, false para la EF con foto)', () => {
    const ocurrencias = sql.match(/return p_foto_path is null;/g) ?? [];
    // Los 5 caminos silenciosos: pet inexistente/oculto, bloqueo, dedupe por
    // contenido, tope por hora y tope por día. Ninguno debe subir (ni dejar
    // apuntando) una foto de un aviso que nunca se registró, pero tampoco
    // deben delatar el motivo del descarte hacia afuera.
    expect(ocurrencias.length).toBe(5);
  });

  it('el camino feliz termina en `return true;`', () => {
    expect(sql).toMatch(/return true;\s*\n\s*end;\s*\n\s*\$\$;/);
  });
});
