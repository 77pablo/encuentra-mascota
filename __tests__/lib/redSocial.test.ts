import {
  construirUrlRedSocial,
  parseRedSocial,
  iconoRedSocial,
} from '../../src/lib/redSocial';

describe('construirUrlRedSocial', () => {
  it('arma la URL de Instagram desde el usuario', () => {
    expect(construirUrlRedSocial('instagram', '77.pvblo')).toBe('https://instagram.com/77.pvblo');
  });

  it('saca la arroba y los espacios del usuario', () => {
    expect(construirUrlRedSocial('instagram', '  @77.pvblo  ')).toBe('https://instagram.com/77.pvblo');
  });

  it('TikTok lleva arroba en la ruta', () => {
    expect(construirUrlRedSocial('tiktok', '77.pvblo')).toBe('https://tiktok.com/@77.pvblo');
    expect(construirUrlRedSocial('tiktok', '@77.pvblo')).toBe('https://tiktok.com/@77.pvblo');
  });

  it('Facebook usa el usuario tal cual (sin arroba)', () => {
    expect(construirUrlRedSocial('facebook', 'pablo.perez')).toBe('https://facebook.com/pablo.perez');
  });

  it('"otro" antepone https:// si falta', () => {
    expect(construirUrlRedSocial('otro', 'linktr.ee/pablo')).toBe('https://linktr.ee/pablo');
    expect(construirUrlRedSocial('otro', 'https://linktr.ee/pablo')).toBe('https://linktr.ee/pablo');
  });

  it('si pegan un link completo lo usa tal cual, sin importar la plataforma', () => {
    expect(construirUrlRedSocial('instagram', 'https://instagram.com/77.pvblo')).toBe(
      'https://instagram.com/77.pvblo',
    );
  });

  it('devuelve cadena vacía si no hay usuario', () => {
    expect(construirUrlRedSocial('instagram', '')).toBe('');
    expect(construirUrlRedSocial('instagram', '   ')).toBe('');
  });
});

describe('parseRedSocial', () => {
  it('devuelve null si está vacío', () => {
    expect(parseRedSocial(null)).toBeNull();
    expect(parseRedSocial(undefined)).toBeNull();
    expect(parseRedSocial('   ')).toBeNull();
  });

  it('reconoce una URL de Instagram y la deja tocable', () => {
    expect(parseRedSocial('https://instagram.com/77.pvblo')).toEqual({
      tipo: 'instagram',
      usuario: '@77.pvblo',
      url: 'https://instagram.com/77.pvblo',
    });
  });

  it('reconoce Facebook (sin arroba)', () => {
    expect(parseRedSocial('https://facebook.com/pablo.perez')).toEqual({
      tipo: 'facebook',
      usuario: 'pablo.perez',
      url: 'https://facebook.com/pablo.perez',
    });
  });

  it('reconoce TikTok', () => {
    expect(parseRedSocial('https://tiktok.com/@77.pvblo')).toEqual({
      tipo: 'tiktok',
      usuario: '@77.pvblo',
      url: 'https://tiktok.com/@77.pvblo',
    });
  });

  it('cualquier otra URL queda como "otro", tocable, mostrando el dominio', () => {
    expect(parseRedSocial('https://linktr.ee/pablo')).toEqual({
      tipo: 'otro',
      usuario: 'linktr.ee/pablo',
      url: 'https://linktr.ee/pablo',
    });
  });

  it('un valor viejo de texto suelto no es tocable (url null)', () => {
    expect(parseRedSocial('@77.pvblo')).toEqual({
      tipo: 'otro',
      usuario: '@77.pvblo',
      url: null,
    });
  });
});

describe('iconoRedSocial', () => {
  it('mapea cada plataforma a su ícono', () => {
    expect(iconoRedSocial('instagram')).toBe('logo-instagram');
    expect(iconoRedSocial('facebook')).toBe('logo-facebook');
    expect(iconoRedSocial('tiktok')).toBe('logo-tiktok');
    expect(iconoRedSocial('otro')).toBe('share-social');
  });
});
