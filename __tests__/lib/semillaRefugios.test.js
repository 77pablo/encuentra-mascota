const { validarRefugio, aFilas } = require('../../scripts/semilla-refugios');

const valido = {
  id: 1,
  nombre: 'Canil Municipal de Temuco',
  comuna: 'Temuco',
  region: 'Araucanía',
  direccion: 'Av. Los Poetas 01100',
  lat: -38.7359,
  lng: -72.5904,
  fuente: 'https://www.temuco.cl/canil',
};

describe('validarRefugio', () => {
  it('acepta una entrada completa', () => {
    expect(validarRefugio(valido)).toBeNull();
  });
  it('rechaza sin fuente https (la regla dura del spec)', () => {
    expect(validarRefugio({ ...valido, fuente: undefined })).toMatch(/fuente/);
    expect(validarRefugio({ ...valido, fuente: 'http://temuco.cl' })).toMatch(/fuente/);
  });
  it('rechaza coordenadas fuera de Chile', () => {
    expect(validarRefugio({ ...valido, lat: 40.4 })).toMatch(/lat/);
    expect(validarRefugio({ ...valido, lng: -3.7 })).toMatch(/lng/);
  });
  it('rechaza id no entero positivo (osm_id es bigint en la 0063)', () => {
    expect(validarRefugio({ ...valido, id: 'canil-temuco' })).toMatch(/id/);
    expect(validarRefugio({ ...valido, id: 0 })).toMatch(/id/);
  });
  it('rechaza nombre, comuna o region vacíos', () => {
    expect(validarRefugio({ ...valido, nombre: '  ' })).toMatch(/nombre/);
    expect(validarRefugio({ ...valido, comuna: '' })).toMatch(/comuna/);
    expect(validarRefugio({ ...valido, region: '' })).toMatch(/region/);
  });
});

describe('aFilas', () => {
  it('mapea a la forma EXACTA de lugares (sin fuente, sin region, sin nada de más)', () => {
    const filas = aFilas([valido]);
    expect(filas).toHaveLength(1);
    // Igualdad de CONJUNTO de claves (lección D2-t13): ni una columna de más
    // —fuente y region NO viajan a la base— ni una de menos.
    expect(Object.keys(filas[0]).sort()).toEqual(
      ['categoria', 'comuna', 'direccion', 'lat', 'lng', 'nombre', 'osm_id', 'osm_tipo'].sort(),
    );
    expect(filas[0].osm_tipo).toBe('curado');
    expect(filas[0].osm_id).toBe(1);
    expect(filas[0].categoria).toBe('refugio');
  });
  it('direccion vacía degrada a null (como semilla-lugares)', () => {
    expect(aFilas([{ ...valido, direccion: '  ' }])[0].direccion).toBeNull();
  });
  it('lanza con TODOS los motivos si algo no valida (no solo el primero)', () => {
    expect(() => aFilas([{ ...valido, fuente: 'x' }, { ...valido, id: 2, lat: 12 }]))
      .toThrow(/entrada 0[\s\S]*entrada 1/);
  });
  it('lanza ante ids repetidos (el id es la identidad del upsert)', () => {
    expect(() => aFilas([valido, { ...valido }])).toThrow(/repetido/);
  });
});

describe('el dataset real del repo', () => {
  it('valida entero y cubre el alcance del spec', () => {
    const { refugios } = require('../../data/refugios-curados.json');
    const filas = aFilas(refugios);
    expect(filas.length).toBeGreaterThanOrEqual(10);
    const regiones = new Set(refugios.map((r) => r.region));
    expect(regiones.has('Araucanía')).toBe(true);
    expect(regiones.has('Metropolitana')).toBe(true);
  });
});
