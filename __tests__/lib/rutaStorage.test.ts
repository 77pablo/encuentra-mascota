import { rutaDeFotoPropia } from '../../src/lib/rutaStorage';

const UID = '11111111-1111-1111-1111-111111111111';
const OTRO = '22222222-2222-2222-2222-222222222222';
const BASE = 'https://ywlrcfaybnikaurxsgtj.supabase.co/storage/v1/object/public/pet-photos';

describe('rutaDeFotoPropia', () => {
  it('extrae la ruta de una foto propia', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/abc123.jpg`, UID)).toBe(`${UID}/abc123.jpg`);
  });

  // La defensa central: nunca devolver una ruta que no sea del propio usuario.
  it('rechaza la foto de otra persona', () => {
    expect(rutaDeFotoPropia(`${BASE}/${OTRO}/abc123.jpg`, UID)).toBeNull();
  });

  // Mismo caso que cazó el Critical de la tanda de borrado de cuenta.
  it('rechaza un intento de salirse de la carpeta propia', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/../${OTRO}/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza subcarpetas: la forma exigida es <uid>/<archivo>', () => {
    expect(rutaDeFotoPropia(`${BASE}/${UID}/sub/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza una URL de otro bucket', () => {
    const otroBucket = BASE.replace('pet-photos', 'avatares');
    expect(rutaDeFotoPropia(`${otroBucket}/${UID}/abc123.jpg`, UID)).toBeNull();
  });

  it('rechaza basura', () => {
    expect(rutaDeFotoPropia('', UID)).toBeNull();
    expect(rutaDeFotoPropia('no-es-una-url', UID)).toBeNull();
  });

  // Con la implementación vieja (`new RegExp(userId)`), un userId con
  // metacaracteres de regex rompía el filtro: `'.*'` matcheaba la ruta de
  // CUALQUIER otro usuario, aunque esa ruta no empezara con `.*` de verdad.
  it('rechaza la foto de otra persona aunque el userId tenga metacaracteres de regex', () => {
    expect(rutaDeFotoPropia(`${BASE}/${OTRO}/abc123.jpg`, '.*')).toBeNull();
  });
});
