import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0060_denuncia_nueva.sql'),
  'utf8',
);

describe('0060: una denuncia nueva avisa a los admins', () => {
  it('el CHECK de tipo se rehace con la lista UNIÓN completa', () => {
    expect(sql).toMatch(/drop constraint if exists notification_events_tipo_check/);
    for (const t of ['reporte_nuevo','avistamiento','pista','coincidencia','escaneo_collar','busqueda_guardada','avistamiento_anonimo','denuncia_nueva']) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it('avisa a cada admin activo, nunca al propio denunciante', () => {
    expect(sql).toMatch(/a\.es_admin/);
    expect(sql).toMatch(/a\.suspendido_en is null/);
    expect(sql).toMatch(/a\.eliminado_en is null/);
    expect(sql).toMatch(/a\.id <> new\.reporter_user/);
  });

  it('datos lleva claves de listas cerradas, no el detalle libre del denunciante', () => {
    expect(sql).toMatch(/jsonb_build_object\('tipo_denuncia', new\.tipo, 'motivo', new\.motivo\)/);
    expect(sql).not.toMatch(/new\.detalle/);
  });

  it('el trigger es after insert y la función es security definer con search_path fijo', () => {
    expect(sql).toMatch(/after insert on public\.denuncias/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
  });
});
