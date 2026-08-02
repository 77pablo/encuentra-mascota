import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0059_privacidad_red_social.sql'),
  'utf8',
);

describe('0059: la red social del perfil público se puede apagar', () => {
  it('la columna existe, con default true (no sorprender a quien ya la cargó)', () => {
    expect(sql).toMatch(/add column if not exists mostrar_red_social boolean not null default true/);
  });

  it('el filtro vive DENTRO de perfil_publico, no en el cliente', () => {
    expect(sql).toMatch(/create or replace function public\.perfil_publico/);
    expect(sql).toMatch(/case when p\.mostrar_red_social then p\.red_social else null end/);
  });

  it('el grant de update se rehace entero: revoke primero, lista exacta después', () => {
    expect(sql).toMatch(/revoke update on public\.profiles from public, anon, authenticated/);
    expect(sql).toMatch(/grant update \(nombre, foto_perfil, telefono, red_social, mostrar_red_social\)/);
  });

  it('mi_perfil cambia el retorno: drop + create + re-grant, y anon sigue afuera', () => {
    expect(sql).toMatch(/drop function public\.mi_perfil\(\)/);
    expect(sql).toMatch(/mostrar_red_social boolean\s*\)/);
    expect(sql).toMatch(/revoke all on function public\.mi_perfil\(\) from public, anon/);
  });

  it('perfil_publico conserva la vigencia de adopciones de la 0053 (no desandar)', () => {
    expect(sql).toMatch(/interval '90 days'/);
  });
});
