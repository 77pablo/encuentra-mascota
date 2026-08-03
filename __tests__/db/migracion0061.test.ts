import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0061_seguimiento_anonimo.sql'),
  'utf8',
);

describe('0061: cerrar el círculo con quien avisó', () => {
  it('la tabla es de finalidad única: RLS prendida y SIN políticas (invisible)', () => {
    expect(sql).toMatch(/create table public\.seguimientos_anonimos/);
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
    expect(sql).toMatch(/alter table public\.seguimientos_anonimos enable row level security/);
    expect(sql).not.toMatch(/create policy[^;]*seguimientos_anonimos/);
    expect(sql).toMatch(/unique \(pet_id, correo\)/);
  });

  it('la firma vieja se dropea ENTERA y la nueva re-otorga a anon y authenticated', () => {
    expect(sql).toMatch(/drop function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision\)/);
    expect(sql).toMatch(/grant execute on function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\) to anon/);
    expect(sql).toMatch(/grant execute on function public\.avistar_sin_cuenta\(uuid, text, double precision, double precision, text\) to authenticated/);
  });

  it('el correo se valida, se normaliza y tiene techo por reporte', () => {
    expect(sql).toMatch(/lower\(btrim\(p_correo\)\)/);
    expect(sql).toMatch(/on conflict \(pet_id, correo\) do nothing/);
    expect(sql).toMatch(/>= 50/);
  });

  it('el trigger manda el correo SOLO en el reencuentro y borra en todo cierre', () => {
    expect(sql).toMatch(/new\.reunida_en is not null and old\.reunida_en is null/);
    expect(sql).toMatch(/new\.activo = false and old\.activo = true/);
    expect(sql).toMatch(/delete from public\.seguimientos_anonimos/);
  });

  it('mis_avisos excluye el tipo (lleva el correo del vecino en datos)', () => {
    expect(sql).toMatch(/create or replace function public\.mis_avisos/);
    expect(sql).toMatch(/'reencuentro_seguimiento'/);
  });

  it('los topes de la 0055 siguen vivos en el cuerpo nuevo (no desandar la puerta)', () => {
    expect(sql).toMatch(/>= 10/);
    expect(sql).toMatch(/>= 30/);
    expect(sql).toMatch(/interval '5 minutes'/);
  });
});
