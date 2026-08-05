import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0066_rastro_publico.sql'), 'utf8');

describe('0066: el rastro para quien llega por el QR', () => {
  it('la policy nueva REPITE los filtros de la ficha (no los hereda)', () => {
    expect(sql).toMatch(/p\.activo/);
    expect(sql).toMatch(/p\.oculto = false/);
  });

  it('es solo de lectura y solo para anon', () => {
    expect(sql).toMatch(/for select to anon/);
    expect(sql).not.toMatch(/for (insert|update|delete) to anon/);
  });

  it('no toca la policy de authenticated que ya existia', () => {
    expect(sql).not.toMatch(/drop policy[^;]*authenticated/);
  });

  it('no expone al autor del avistamiento', () => {
    expect(sql).not.toMatch(/grant[^;]*profiles[^;]*to anon/);
  });
});
