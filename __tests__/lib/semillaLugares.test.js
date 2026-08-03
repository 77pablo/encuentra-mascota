const { normalizarElemento } = require('../../scripts/semilla-lugares');

describe('normalizarElemento', () => {
  it('descarta lo que no tiene nombre (el 9% de OSM en la RM)', () => {
    expect(normalizarElemento({ type: 'node', id: 1, lat: -33, lon: -70, tags: {} })).toBeNull();
  });

  it('toma el centro de un way (no tiene lat/lon propias)', () => {
    const r = normalizarElemento({
      type: 'way', id: 7, center: { lat: -33.4, lon: -70.6 },
      tags: { name: 'Vet Sur', amenity: 'veterinary' },
    });
    expect(r).toMatchObject({ osm_tipo: 'way', osm_id: 7, lat: -33.4, lng: -70.6 });
  });

  it('mapea la categoria y descarta las que no nos sirven', () => {
    const vet = normalizarElemento({ type: 'node', id: 2, lat: -33, lon: -70,
      tags: { name: 'A', amenity: 'veterinary' } });
    expect(vet.categoria).toBe('veterinaria');
    const ref = normalizarElemento({ type: 'node', id: 3, lat: -33, lon: -70,
      tags: { name: 'B', amenity: 'animal_shelter' } });
    expect(ref.categoria).toBe('refugio');
    expect(normalizarElemento({ type: 'node', id: 4, lat: -33, lon: -70,
      tags: { name: 'C', amenity: 'cafe' } })).toBeNull();
  });

  it('arma la direccion con calle y numero, y la deja null si no hay calle', () => {
    const con = normalizarElemento({ type: 'node', id: 5, lat: -33, lon: -70,
      tags: { name: 'D', amenity: 'veterinary', 'addr:street': 'Irarrázaval', 'addr:housenumber': '100' } });
    expect(con.direccion).toBe('Irarrázaval 100');
    const sin = normalizarElemento({ type: 'node', id: 6, lat: -33, lon: -70,
      tags: { name: 'E', amenity: 'veterinary', 'addr:housenumber': '100' } });
    expect(sin.direccion).toBeNull();
  });

  it('NO inventa telefono: la fila no lleva esa columna', () => {
    const r = normalizarElemento({ type: 'node', id: 8, lat: -33, lon: -70,
      tags: { name: 'F', amenity: 'veterinary', phone: '+56 2 1234 5678' } });
    expect(Object.keys(r)).not.toContain('telefono');
    expect(JSON.stringify(r)).not.toContain('1234');
  });
});
