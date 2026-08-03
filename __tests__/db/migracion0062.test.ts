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

  it('cada descarte silencioso levanta aviso_descartado si venía con foto', () => {
    const ocurrencias = sql.match(/raise exception 'aviso_descartado'/g) ?? [];
    // Los 5 caminos de `return;` sin insertar: pet inexistente/oculto, bloqueo,
    // dedupe por contenido, tope por hora y tope por día. Ninguno debe subir
    // (ni dejar apuntando) una foto de un aviso que nunca se registró.
    expect(ocurrencias.length).toBe(5);
  });

  it('el gate de aviso_descartado va siempre antes de un return silencioso', () => {
    const returns = sql.match(/if p_foto_path is not null then\s*\n\s*raise exception 'aviso_descartado';\s*\n\s*end if;\s*\n\s*return;/g) ?? [];
    expect(returns.length).toBe(5);
  });
});
