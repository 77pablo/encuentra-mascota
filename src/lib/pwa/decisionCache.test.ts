import { estrategiaPara } from './decisionCache';

const ORIGEN = 'https://encuentra-mascota.example';

describe('estrategiaPara', () => {
  it('ignora cualquier origen distinto al propio (nunca intercepta Supabase ni terceros)', () => {
    expect(estrategiaPara('https://xyz.supabase.co/rest/v1/pets', 'cors', ORIGEN)).toBe('ignorar');
    expect(estrategiaPara('https://otra-cosa.com/algo', 'no-cors', ORIGEN)).toBe('ignorar');
  });

  it('cache-first para los bundles hasheados de Expo', () => {
    expect(
      estrategiaPara(`${ORIGEN}/_expo/static/js/web/entry-abc123.js`, 'no-cors', ORIGEN),
    ).toBe('cache-first');
  });

  it('cache-first para los íconos de la PWA', () => {
    expect(estrategiaPara(`${ORIGEN}/icons/icono-192.png`, 'no-cors', ORIGEN)).toBe('cache-first');
  });

  it('red-con-fallback para navegaciones (HTML) del propio origen', () => {
    expect(estrategiaPara(`${ORIGEN}/mascota/abc-123`, 'navigate', ORIGEN)).toBe(
      'red-con-fallback',
    );
    expect(estrategiaPara(`${ORIGEN}/`, 'navigate', ORIGEN)).toBe('red-con-fallback');
  });

  it('red (sin cachear) para cualquier otro pedido del propio origen', () => {
    expect(estrategiaPara(`${ORIGEN}/manifest.webmanifest`, 'no-cors', ORIGEN)).toBe('red');
    expect(estrategiaPara(`${ORIGEN}/algun-json`, 'cors', ORIGEN)).toBe('red');
  });

  it('un origen propio con distinto puerto/protocolo también se considera "otro origen"', () => {
    expect(estrategiaPara('http://encuentra-mascota.example/_expo/static/x.js', 'no-cors', ORIGEN)).toBe(
      'ignorar',
    );
  });
});
