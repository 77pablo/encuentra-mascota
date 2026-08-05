import { iconoHtml, regionABounds, popupHtml } from '../../src/lib/mapaWeb';

describe('iconoHtml', () => {
  it('usa el color que le pasan', () => {
    expect(iconoHtml('#C62828')).toContain('#C62828');
  });

  it('sin etiqueta no deja un circulo vacio con texto fantasma', () => {
    expect(iconoHtml('#000')).not.toMatch(/<text[^>]*>\s*(undefined|null)/);
  });

  it('numera el rastro cuando le dan etiqueta', () => {
    expect(iconoHtml('#000', 3)).toMatch(/>3</);
  });

  it('escapa la etiqueta: un titulo no puede inyectar HTML en el pin', () => {
    expect(iconoHtml('#000', '<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});

describe('popupHtml', () => {
  it('arma el popup con titulo y descripcion', () => {
    expect(popupHtml('Firulais', 'visto en la plaza')).toBe('<b>Firulais</b><br/>visto en la plaza');
  });

  it('sin descripcion no deja un <br/> colgando', () => {
    expect(popupHtml('Firulais')).toBe('<b>Firulais</b>');
  });

  it('escapa el titulo: texto ajeno no puede inyectar HTML en el popup (XSS almacenado, hallazgo revision 4-ago)', () => {
    expect(popupHtml('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  it('escapa la descripcion: la nota de un avistamiento no puede inyectar HTML (revision 4-ago)', () => {
    expect(popupHtml('Firulais', '<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});

describe('regionABounds', () => {
  it('convierte region de react-native-maps a los dos vertices de Leaflet', () => {
    const b = regionABounds({
      latitude: -33.45, longitude: -70.65, latitudeDelta: 0.02, longitudeDelta: 0.02,
    });
    expect(b[0][0]).toBeCloseTo(-33.46, 6);
    expect(b[1][0]).toBeCloseTo(-33.44, 6);
    expect(b[0][1]).toBeCloseTo(-70.66, 6);
    expect(b[1][1]).toBeCloseTo(-70.64, 6);
  });

  it('un delta de cero no produce un bounds degenerado', () => {
    const b = regionABounds({
      latitude: -33, longitude: -70, latitudeDelta: 0, longitudeDelta: 0,
    });
    expect(b[0][0]).toBeLessThan(b[1][0]);
    expect(b[0][1]).toBeLessThan(b[1][1]);
  });
});

it('la web ya no dice que el mapa es solo de la app movil', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PlatformMap.web.tsx'), 'utf8');
  expect(fuente).not.toMatch(/solo está disponible en la app móvil/);
  expect(fuente).toMatch(/openstreetmap/i);
  expect(fuente).toMatch(/colaboradores de OpenStreetMap/);   // ODbL obliga
});

it('Marker en web ya no devuelve null incondicionalmente', () => {
  const fuente = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'src', 'components', 'PlatformMap.web.tsx'), 'utf8');
  expect(fuente).not.toMatch(/export function Marker\([^)]*\)\s*\{\s*return null;\s*\}/);
});
