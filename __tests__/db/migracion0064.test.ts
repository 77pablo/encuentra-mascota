import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0064_vectores_de_foto.sql'), 'utf8');

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

  it('el vector NO se puede leer desde el cliente (seria un oraculo de parecido)', () => {
    expect(sql).not.toMatch(/create policy[^;]*for select[^;]*pet_fotos_vector/);
  });

  it('se borra con el reporte', () => {
    expect(sql).toMatch(/references public\.pets\(id\) on delete cascade/);
  });
});
